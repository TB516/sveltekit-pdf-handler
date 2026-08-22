# sveltekit-pdf-renderer

Render a server-side Svelte component as a PDF response from a SvelteKit endpoint.

> [!WARNING]
> This project is still under active development. Its public API may change between releases until
> it reaches a stable version.

## Installation

```sh
pnpm add sveltekit-pdf-renderer
```

This package requires Svelte 5, SvelteKit 2, and Node.js 22.12 or newer.

Puppeteer downloads a compatible browser during installation. If your package manager blocks
dependency install scripts, follow Puppeteer's guidance for
[installing a browser manually](https://pptr.dev/troubleshooting#blocked-install-scripts).

## Usage

> [!NOTE]
> Until compiler integration is available, PDF components must opt into injected CSS so that
> `render()` includes their styles.

`src/routes/resume.pdf/Resume.svelte`

```svelte
<svelte:options css="injected" />

<script module lang="ts">
  import type { PdfConfig } from 'sveltekit-pdf-renderer';
  import regular from './fonts/XCharter-Regular.woff2?inline';

  export const pdf = {
    fonts: [
      {
        family: 'XCharter',
        source: regular,
        format: 'woff2',
        weight: 400,
      },
    ],
    pdf: {
      format: 'letter',
      preferCSSPageSize: true,
    },
  } satisfies PdfConfig;
</script>

<script lang="ts">
  let { name }: { name: string } = $props();
</script>

<h1>{name}</h1>

<style>
  :global(html) {
    font-family: 'XCharter', serif;
  }

  @page {
    size: letter;
    margin: 0.5in;
  }
</style>
```

Create a responder at module scope, then pass it the request event and complete component module.
Because the responder returns a normal `Response`, the endpoint can perform any loading or guards
before rendering the PDF:

> [!IMPORTANT]
> Keep responders in server-only modules, such as route server files or `$lib/server`, so Puppeteer
> is never included in a client bundle.

`src/routes/resume.pdf/+server.ts`

```ts
import type { RequestHandler } from './$types';
import { createPdfResponder } from 'sveltekit-pdf-renderer';
import * as ResumeModule from './Resume.svelte';

const createPdfResponse = createPdfResponder();

export const GET: RequestHandler = async (event) => {
  const name = event.url.searchParams.get('name') ?? 'TB516';

  return createPdfResponse(event, ResumeModule, {
    props: { name },
  });
};
```

Every call through the same responder function reuses one Chromium process. Each render receives a
separate browser context and page, so request storage is isolated. Chromium exits with the SvelteKit
prerender worker or server process, so normal usage does not require browser lifecycle management.

PDF endpoints work with server adapters and static deployments. For a static deployment, prerender
the endpoint so PDFs are generated at build time. A compatible browser must be available wherever
generation runs, whether that is the build environment or the deployed server.

## API

### `createPdfResponder(options?: PdfResponderOptions): PdfResponder`

Creates a responder backed by one lazily launched browser. Calls through the same responder reuse
that browser while receiving isolated browser contexts and pages. Calling `createPdfResponder`
again creates a separate browser scope.

Pass Puppeteer launch settings through `options.launchOptions`. See Puppeteer's
[`LaunchOptions`](https://pptr.dev/api/puppeteer.launchoptions) documentation for all available
settings. Set `options.browserLaunchRetries` to a non-negative integer to retry failed browser
launches with exponential backoff. The value excludes the initial attempt and defaults to `0`.

Puppeteer applies its own timeouts to individual operations. Set
`options.renderTimeoutMs` to a finite positive number to add an overall deadline, in milliseconds,
for each PDF rendering operation.

Set `options.maxConcurrentGenerations` to a positive integer to limit how many PDFs one responder
generates at once. Additional calls wait for capacity and remain cancellable. Leaving it unset does
not limit concurrency.

Call `responder.getPendingGenerations()` to inspect how many queued or active generations the
responder currently owns. This is an advisory snapshot that can be used when routing work between
multiple responders.

Aborting a SvelteKit request interrupts its queued or active PDF generation. Cancellation also
stops cancellable asset loading and Puppeteer waits, then closes the generation's isolated browser
context.

The returned responder also provides `dispose(): Promise<void>` and implements
`Symbol.asyncDispose`. Disposal rejects new renders, waits for already accepted renders to settle,
and then closes the responder's browser. It is safe to call more than once.

To replace a responder without interrupting active requests, install the replacement before
disposing the previous responder:

```ts
let createPdfResponse = createPdfResponder();

const previous = createPdfResponse;
createPdfResponse = createPdfResponder({ launchOptions: newLaunchOptions });
await previous.dispose();
```

A call made after disposal rejects with `PdfResponderDisposedError`. A browser close failure rejects
disposal with `BrowserCloseError`.

### Effect API

Import from `sveltekit-pdf-renderer/effect` to compose PDF generation directly with Effect and keep
generation errors in the return type:

```ts
import { createPdfResponder } from 'sveltekit-pdf-renderer/effect';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const createPdfResponse = yield* createPdfResponder();

  const response = yield* createPdfResponse(event, ResumeModule, {
    props: { name: 'TB516' },
  });

  yield* createPdfResponse.dispose;

  return response;
});
```

The responder owns the same browser lifecycle as the standard API. Its factory, calls, and
`dispose` property return composable Effect values instead of promises.

## Browser configuration

Pass Puppeteer launch options to `createPdfResponder`. For example, a CI environment that requires
Chromium to run without its sandbox can use a shared server-only module:

`src/lib/server/pdf.ts`

```ts
import { createPdfResponder } from 'sveltekit-pdf-renderer';

export const createPdfResponse = createPdfResponder({
  launchOptions: {
    args: process.env.CI === 'true' ? ['--no-sandbox'] : [],
  },
});
```

Import this `createPdfResponse` function wherever PDFs are generated. Options such as
`executablePath` are passed directly to Puppeteer.

> [!WARNING]
> Disabling the sandbox reduces Chromium's process isolation. Only pass `--no-sandbox` when the
> environment requires it and the rendered documents and assets are trusted.
