import type { RequestEvent } from '@sveltejs/kit';
import { Effect, Fiber, Queue } from 'effect';
import type { Browser, HTTPRequest, PDFOptions } from 'puppeteer';

import { PdfRenderError } from '../errors.js';

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
   * @returns Completion after the request is continued, fulfilled, or aborted.
   */
  const handleAssetRequest = (request: HTTPRequest): Effect.Effect<void> =>
    Effect.tryPromise({
      try: async (signal) => {
        const requestUrl = new URL(request.url());

        if (requestUrl.origin !== event.url.origin) {
          await request.continue();
          return;
        }

        const assetResponse = await event.fetch(requestUrl, { signal });

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
    );

  return Effect.acquireUseRelease(
    Effect.tryPromise({
      try: () => browser.createBrowserContext(),
      catch: (cause) => new PdfRenderError({ cause }),
    }),
    (context) =>
      Effect.gen(function* () {
        const page = yield* Effect.tryPromise({
          try: () => context.newPage(),
          catch: (cause) => new PdfRenderError({ cause }),
        });

        yield* Effect.tryPromise({
          try: () => page.setRequestInterception(true),
          catch: (cause) => new PdfRenderError({ cause }),
        });

        const requests = yield* Queue.make<HTTPRequest>();
        const enqueueRequest = (request: HTTPRequest): void => {
          Queue.offerUnsafe(requests, request);
        };

        return yield* Effect.acquireUseRelease(
          Effect.gen(function* () {
            page.on('request', enqueueRequest);

            return yield* Effect.forever(
              Effect.gen(function* () {
                const request = yield* Queue.take(requests);
                yield* handleAssetRequest(request).pipe(Effect.forkChild);
              }),
            ).pipe(Effect.forkChild);
          }),
          () =>
            Effect.gen(function* () {
              yield* Effect.tryPromise({
                try: (signal) => page.setContent(html, { signal, waitUntil: 'load' }),
                catch: (cause) => new PdfRenderError({ cause }),
              });
              yield* Effect.tryPromise({
                try: (signal) => page.waitForNetworkIdle({ signal }),
                catch: (cause) => new PdfRenderError({ cause }),
              });

              if (assetError !== undefined) {
                return yield* assetError;
              }

              return yield* Effect.tryPromise({
                try: () =>
                  page.pdf({
                    printBackground: true,
                    preferCSSPageSize: true,
                    ...pdfOptions,
                  }),
                catch: (cause) => new PdfRenderError({ cause }),
              });
            }),
          (worker) =>
            Effect.gen(function* () {
              page.off('request', enqueueRequest);
              yield* Fiber.interrupt(worker);
            }),
        );
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
