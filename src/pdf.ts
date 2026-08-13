import type { RequestEvent } from '@sveltejs/kit';
import { launch, type Browser, type LaunchOptions } from 'puppeteer';
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
 * Renders a Svelte component as a PDF response for a SvelteKit request.
 *
 * Pass the complete component module (`import * as DocumentModule`) to include a
 * `pdf` configuration exported from the component's module script.
 *
 * @typeParam ComponentType The Svelte component type being rendered.
 * @param event The current SvelteKit request event.
 * @param componentModule The Svelte component's complete module namespace.
 * @param args PDF options, component props, and response metadata.
 * @returns The generated PDF response.
 */
export type PdfResponder = <ComponentType extends Component>(
  event: RequestEvent,
  componentModule: PdfComponentModule<ComponentType>,
  ...args: PdfResponseArgs<PdfComponentProps<ComponentType>>
) => Promise<Response>;

/**
 * Creates a PDF responder backed by one lazily launched Chromium process.
 *
 * Every call through the returned function reuses the browser while receiving an isolated browser
 * context and page. Calling this factory again creates a separate browser scope.
 *
 * @param launchOptions Puppeteer options used when Chromium is launched.
 * @returns A configured PDF responder function.
 */
export const createPdfResponder = (launchOptions: LaunchOptions = {}): PdfResponder => {
  let browserPromise: Promise<Browser> | undefined;

  /**
   * Returns the responder's browser, launching or relaunching it when needed.
   *
   * @returns The connected browser shared by this responder.
   */
  const getBrowser = async (): Promise<Browser> => {
    if (browserPromise !== undefined) {
      return browserPromise;
    }

    const launchPromise = launch(launchOptions);
    browserPromise = launchPromise;

    try {
      const browser = await launchPromise;
      browser.once('disconnected', () => {
        if (browserPromise === launchPromise) {
          browserPromise = undefined;
        }
      });
      return browser;
    } catch (error) {
      if (browserPromise === launchPromise) {
        browserPromise = undefined;
      }
      throw error;
    }
  };

  return async <ComponentType extends Component>(
    event: RequestEvent,
    componentModule: PdfComponentModule<ComponentType>,
    ...[options]: PdfResponseArgs<PdfComponentProps<ComponentType>>
  ): Promise<Response> => {
    const component = componentModule.default;
    const resolvedOptions = {
      fonts: [...(componentModule.pdf?.fonts ?? []), ...(options?.fonts ?? [])],
      lang: options?.lang ?? componentModule.pdf?.lang,
      pdf: { ...componentModule.pdf?.pdf, ...options?.pdf },
      response: options?.response,
    };

    const props = options?.props ?? {};
    const { body, head } = await render(component as Component, { props });

    const html = createPdfHtml({
      baseUrl: event.url,
      body,
      fonts: resolvedOptions.fonts,
      head,
      lang: resolvedOptions.lang,
    });

    const pdfBytes = await renderPdf({
      browser: await getBrowser(),
      event,
      html,
      pdfOptions: resolvedOptions.pdf,
    });

    return new Response(Uint8Array.from(pdfBytes).buffer, {
      headers: createPdfHeaders(resolvedOptions.response),
    });
  };
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
