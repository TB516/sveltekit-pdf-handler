import type { RequestEvent } from '@sveltejs/kit';
import type { Component } from 'svelte';
import { render } from 'svelte/server';

import { createPdfHtml } from './html.js';
import { renderPdf } from './render.js';
import type {
  PdfComponentModule,
  PdfComponentProps,
  PdfResponseArgs,
  PdfResponseOptions,
} from './types.js';

/**
 * Creates a PDF response by rendering a Svelte component for a SvelteKit request.
 *
 * Pass the complete component module (`import * as DocumentModule`) to include a
 * `pdf` configuration exported from the component's module script.
 *
 * @param event The current SvelteKit request event.
 * @param componentModule The Svelte component's complete module namespace.
 * @param options PDF options, component props, and response metadata.
 * @returns The generated PDF response.
 */
export const createPdfResponse = async <ComponentType extends Component<any>>(
  event: RequestEvent,
  componentModule: PdfComponentModule<ComponentType>,
  ...[options]: PdfResponseArgs<PdfComponentProps<ComponentType>>
): Promise<Response> => {
  const component: Component<any> = componentModule.default;
  const resolvedOptions = {
    fonts: [...(componentModule.pdf?.fonts ?? []), ...(options?.fonts ?? [])],
    lang: options?.lang ?? componentModule.pdf?.lang,
    pdf: { ...componentModule.pdf?.pdf, ...options?.pdf },
    response: options?.response,
  };

  const props = options?.props ?? {};
  const { body, head } = await render(component, { props });

  const html = createPdfHtml({
    baseUrl: event.url,
    body,
    fonts: resolvedOptions.fonts,
    head,
    lang: resolvedOptions.lang,
  });

  const pdfBytes = await renderPdf({
    event,
    html,
    pdfOptions: resolvedOptions.pdf,
  });

  return new Response(Uint8Array.from(pdfBytes).buffer, {
    headers: createPdfHeaders(resolvedOptions.response),
  });
};

/**
 * Creates the headers returned with a generated PDF.
 *
 * @param options The configured response headers and content disposition.
 * @returns Headers for the PDF response.
 */
const createPdfHeaders = (options: PdfResponseOptions | undefined): Headers => {
  const headers = new Headers(options?.headers);
  headers.set('content-type', 'application/pdf');

  if (options?.disposition !== undefined) {
    const filename =
      options.filename === undefined
        ? ''
        : `; filename*=UTF-8''${encodeHeaderFilename(options.filename)}`;
    headers.set('content-disposition', `${options.disposition}${filename}`);
  }

  return headers;
};

/**
 * Encodes a filename for the UTF-8 Content-Disposition parameter.
 *
 * @param filename The unencoded response filename.
 * @returns The RFC 5987-compatible filename value.
 */
const encodeHeaderFilename = (filename: string): string => {
  return encodeURIComponent(filename)
    .replaceAll("'", '%27')
    .replaceAll('(', '%28')
    .replaceAll(')', '%29')
    .replaceAll('*', '%2A');
};
