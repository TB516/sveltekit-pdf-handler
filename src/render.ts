import type { RequestEvent } from '@sveltejs/kit';
import { Effect } from 'effect';
import type { Browser, HTTPRequest, PDFOptions } from 'puppeteer';

import { PdfRenderError } from './errors.js';

/**
 * Provides the browser, request, document, and PDF options used for one render.
 */
interface PdfRenderOptions {
  /** Browser in which an isolated context is created. */
  browser: Browser;

  /** Current SvelteKit request event used to load same-origin assets. */
  event: RequestEvent;

  /** Complete HTML document loaded by Chromium. */
  html: string;

  /** Puppeteer options used to generate the PDF. */
  pdfOptions: Omit<PDFOptions, 'path'> | undefined;
}

/**
 * Renders a complete HTML document to PDF in an isolated page of a shared browser.
 *
 * @param options The request, HTML document, and Puppeteer options used for the render.
 * @returns The generated PDF bytes.
 */
export const renderPdf = ({
  browser,
  event,
  html,
  pdfOptions,
}: PdfRenderOptions): Effect.Effect<Uint8Array, PdfRenderError> => {
  let assetError: PdfRenderError | undefined;

  /**
   * Loads an intercepted browser request through SvelteKit when it is same-origin.
   *
   * @param request The intercepted Puppeteer request.
   * @returns A promise that resolves after the request is continued, fulfilled, or aborted.
   */
  const handleAssetRequest = (request: HTTPRequest): Promise<void> =>
    Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const requestUrl = new URL(request.url());

          if (requestUrl.origin !== event.url.origin) {
            await request.continue();
            return;
          }

          const assetResponse = await event.fetch(requestUrl);

          await request.respond({
            status: assetResponse.status,
            headers: prepareAssetResponseHeaders(assetResponse.headers),
            body: new Uint8Array(await assetResponse.arrayBuffer()),
          });
        },
        catch: (cause) => new PdfRenderError({ cause }),
      }).pipe(
        Effect.catchTag('PdfRenderError', (error) =>
          Effect.gen(function* () {
            assetError ??= error;
            yield* Effect.ignore(
              Effect.tryPromise({
                try: () => request.abort('failed'),
                catch: (cause) => new PdfRenderError({ cause }),
              }),
            );
          }),
        ),
      ),
    );

  return Effect.acquireUseRelease(
    Effect.tryPromise({
      try: () => browser.createBrowserContext(),
      catch: (cause) => new PdfRenderError({ cause }),
    }),
    (context) =>
      Effect.tryPromise({
        try: async () => {
          const page = await context.newPage();
          await page.setRequestInterception(true);
          page.on('request', handleAssetRequest);

          await page.setContent(html, { waitUntil: 'load' });
          await page.waitForNetworkIdle();
          await page.evaluate(() => document.fonts.ready);

          if (assetError !== undefined) {
            throw assetError;
          }

          return page.pdf({
            printBackground: true,
            preferCSSPageSize: true,
            ...pdfOptions,
          });
        },
        catch: (cause) => (cause instanceof PdfRenderError ? cause : new PdfRenderError({ cause })),
      }),
    (context) =>
      Effect.tryPromise({
        try: () => context.close(),
        catch: (cause) => new PdfRenderError({ cause }),
      }),
  );
};

/**
 * Prepares fetch response headers for Puppeteer after the response body has been read.
 *
 * @param sourceHeaders The headers returned by SvelteKit's fetch implementation.
 * @returns Headers suitable for Puppeteer's request response.
 */
const prepareAssetResponseHeaders = (sourceHeaders: Headers): Record<string, string> => {
  const headers = new Headers(sourceHeaders);
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.delete('transfer-encoding');
  return Object.fromEntries(headers);
};
