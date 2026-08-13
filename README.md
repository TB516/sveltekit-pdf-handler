# sveltekit-pdf-renderer

Render a server-side Svelte component as a PDF response from a SvelteKit endpoint.

## Usage

Until the compiler integration is available, PDF components must opt into injected CSS so that
`render()` includes their styles:

```svelte
<!-- src/routes/resume.pdf/Resume.svelte -->
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

```ts
// src/routes/resume.pdf/+server.ts
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

This example generates the PDF for each request with a server adapter.

Every call through the same responder function reuses one Chromium process. Each render receives a
separate browser context and page, so request storage is isolated. Chromium exits with the SvelteKit
prerender worker or server process; no browser lifecycle management is required.

### CI

Some Linux CI environments cannot run Chromium's sandbox. For example, Puppeteer's downloaded
Chrome for Testing binary can encounter Ubuntu 24.04's AppArmor user-namespace restrictions on a
GitHub Actions `ubuntu-latest` runner. Create a configured responder once in a server-only module in
that case:

```ts
// src/lib/server/pdf.ts
import { createPdfResponder } from 'sveltekit-pdf-renderer';

export const createPdfResponse = createPdfResponder({
  args: Deno.env.get('CI') === 'true' ? ['--no-sandbox'] : [],
});
```

Import that configured `createPdfResponse` function in each endpoint. Every call through the same
function reuses its Chromium process while receiving an isolated browser context and page. Calling
`createPdfResponder` again creates a separate browser scope. The factory also accepts other Puppeteer
launch options such as `executablePath`.

Disabling the sandbox reduces Chromium's process isolation. Only pass `--no-sandbox` when the
environment requires it and the rendered documents and assets are trusted.
