# sveltekit-pdf

Render a server-side Svelte component as a PDF response from a SvelteKit endpoint.

## Usage

Until the compiler integration is available, PDF components must opt into injected CSS so that
`render()` includes their styles:

```svelte
<!-- src/routes/resume.pdf/Resume.svelte -->
<svelte:options css="injected" />

<script module lang="ts">
  import type { PdfConfig } from 'sveltekit-pdf';
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

Pass the request event and complete component module to `createPdfResponse`. Because it returns a
normal `Response`, the endpoint can perform any loading or guards before rendering the PDF:

```ts
// src/routes/resume.pdf/+server.ts
import type { RequestHandler } from './$types';
import { createPdfResponse } from 'sveltekit-pdf';
import * as ResumeModule from './Resume.svelte';

export const GET: RequestHandler = async (event) => {
  const name = event.url.searchParams.get('name') ?? 'Thomas Berrios';

  return createPdfResponse(event, ResumeModule, {
    props: { name },
  });
};
```

This example generates the PDF for each request with a server adapter.

One Chromium process is reused across all handlers and requests. Each render receives a separate
browser context and page, so request storage is isolated. Chromium exits with the SvelteKit
prerender worker or server process; no browser lifecycle management is required.
