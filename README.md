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
prerender worker or server process; no browser lifecycle management is required.

PDF endpoints work with server adapters and static deployments. For a static deployment, prerender
the endpoint so PDFs are generated at build time. A compatible browser must be available wherever
generation runs, whether that is the build environment or the deployed server.

## API

### `createPdfResponder(options?: LaunchOptions): PdfResponder`

Creates a responder backed by one lazily launched browser. Calls through the same responder reuse
that browser while receiving isolated browser contexts and pages. Calling `createPdfResponder`
again creates a separate browser scope.

The optional argument is passed directly to Puppeteer. See Puppeteer's
[`LaunchOptions`](https://pptr.dev/api/puppeteer.launchoptions) documentation for all available
settings.

## Browser configuration

Pass Puppeteer launch options to `createPdfResponder`. For example, a CI environment that requires
Chromium to run without its sandbox can use a shared server-only module:

`src/lib/server/pdf.ts`

```ts
import { createPdfResponder } from 'sveltekit-pdf-renderer';

export const createPdfResponse = createPdfResponder({
  args: process.env.CI === 'true' ? ['--no-sandbox'] : [],
});
```

Import this `createPdfResponse` function wherever PDFs are generated. Options such as
`executablePath` are passed directly to Puppeteer.

> [!WARNING]
> Disabling the sandbox reduces Chromium's process isolation. Only pass `--no-sandbox` when the
> environment requires it and the rendered documents and assets are trusted.
