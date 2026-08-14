import type { RequestEvent } from '@sveltejs/kit';
import { Cache, Duration, Effect, Exit, Option } from 'effect';
import { launch, type Browser, type LaunchOptions } from 'puppeteer';
import type { Component } from 'svelte';
import { render } from 'svelte/server';

import {
  BrowserCloseError,
  BrowserLaunchError,
  ComponentRenderError,
  PdfResponseError,
  PdfResponderDisposedError,
} from './errors.js';
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
 * @throws {PdfResponderDisposedError} The responder has already been disposed.
 * @throws {ComponentRenderError} Svelte could not render the component.
 * @throws {BrowserLaunchError} Puppeteer could not launch Chromium.
 * @throws {PdfRenderError} Puppeteer could not render the PDF document.
 * @throws {PdfResponseError} The generated PDF response could not be created.
 */
export interface PdfResponder {
  <ComponentType extends Component>(
    event: RequestEvent,
    componentModule: PdfComponentModule<ComponentType>,
    ...args: PdfResponseArgs<PdfComponentProps<ComponentType>>
  ): Promise<Response>;

  /**
   * Waits for accepted renders to settle and then closes this responder's browser.
   *
   * Calling this method more than once returns the same disposal promise.
   *
   * @returns A promise that resolves when the responder has been disposed.
   * @throws {BrowserCloseError} Puppeteer could not close Chromium.
   */
  dispose(): Promise<void>;

  /**
   * Asynchronously disposes this responder.
   *
   * @returns A promise that resolves when the responder has been disposed.
   * @throws {BrowserCloseError} Puppeteer could not close Chromium.
   */
  [Symbol.asyncDispose](): Promise<void>;
}

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
  const browserCacheKey = 'browser' as const;
  const browserCache = Effect.runSync(
    Cache.makeWith(
      () =>
        Effect.tryPromise({
          try: () => launch(launchOptions),
          catch: (cause) => new BrowserLaunchError({ cause }),
        }),
      {
        capacity: 1,
        timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
      },
    ),
  );
  const activeResponses = new Set<Promise<Response>>();
  let disposed = false;
  let disposalPromise: Promise<void> | undefined;

  /**
   * Returns the responder's browser, launching or relaunching it when needed.
   *
   * @returns The connected browser shared by this responder.
   */
  const getBrowser: Effect.Effect<Browser, BrowserLaunchError> = Effect.gen(function* () {
    const browser = yield* Cache.get(browserCache, browserCacheKey);

    if (browser.connected) {
      return browser;
    }

    const invalidated = yield* Cache.invalidateWhen(
      browserCache,
      browserCacheKey,
      (cachedBrowser) => cachedBrowser === browser,
    );

    if (invalidated) {
      yield* Effect.ignore(
        Effect.tryPromise({
          try: () => browser.close(),
          catch: (cause) => new BrowserCloseError({ cause }),
        }),
      );
    }

    return yield* Cache.get(browserCache, browserCacheKey);
  });

  const responder = (<ComponentType extends Component>(
    event: RequestEvent,
    componentModule: PdfComponentModule<ComponentType>,
    ...[options]: PdfResponseArgs<PdfComponentProps<ComponentType>>
  ): Promise<Response> => {
    if (disposed) {
      return Effect.runPromise(Effect.fail(new PdfResponderDisposedError()));
    }

    const component = componentModule.default;
    const resolvedOptions = {
      fonts: [...(componentModule.pdf?.fonts ?? []), ...(options?.fonts ?? [])],
      lang: options?.lang ?? componentModule.pdf?.lang,
      pdf: { ...componentModule.pdf?.pdf, ...options?.pdf },
      response: options?.response,
    };

    const responsePromise = Effect.runPromise(
      Effect.gen(function* () {
        const props = options?.props ?? {};

        const { body, head } = yield* Effect.try({
          try: () => render(component as Component, { props }),
          catch: (cause) => new ComponentRenderError({ cause }),
        });

        const html = createPdfHtml({
          baseUrl: event.url,
          body,
          fonts: resolvedOptions.fonts,
          head,
          lang: resolvedOptions.lang,
        });

        const browser = yield* getBrowser;

        const pdfBytes = yield* renderPdf({
          browser,
          event,
          html,
          pdfOptions: resolvedOptions.pdf,
        });

        const headers = yield* createPdfHeaders(resolvedOptions.response);

        return yield* Effect.try({
          try: () =>
            new Response(Uint8Array.from(pdfBytes).buffer, {
              headers,
            }),
          catch: (cause) => new PdfResponseError({ cause }),
        });
      }),
    );

    activeResponses.add(responsePromise);
    void responsePromise.then(
      () => activeResponses.delete(responsePromise),
      () => activeResponses.delete(responsePromise),
    );

    return responsePromise;
  }) as PdfResponder;

  const dispose = (): Promise<void> => {
    if (disposalPromise !== undefined) {
      return disposalPromise;
    }

    disposed = true;
    disposalPromise = Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.promise(() => Promise.allSettled(activeResponses));

        const cachedBrowser = yield* Cache.getOption(browserCache, browserCacheKey);

        if (Option.isSome(cachedBrowser)) {
          yield* Effect.tryPromise({
            try: () => cachedBrowser.value.close(),
            catch: (cause) => new BrowserCloseError({ cause }),
          }).pipe(Effect.ensuring(Cache.invalidate(browserCache, browserCacheKey)));
        } else {
          yield* Cache.invalidate(browserCache, browserCacheKey);
        }
      }),
    );

    return disposalPromise;
  };

  responder.dispose = dispose;
  responder[Symbol.asyncDispose] = dispose;

  return responder;
};

/**
 * Creates the headers returned with a generated PDF.
 *
 * @param options The configured response headers and content disposition.
 * @returns Headers for the PDF response.
 */
const createPdfHeaders = (
  options: PdfResponseOptions | undefined,
): Effect.Effect<Headers, PdfResponseError> =>
  Effect.gen(function* () {
    const headers = yield* Effect.try({
      try: () => new Headers(options?.headers),
      catch: (cause) => new PdfResponseError({ cause }),
    });

    headers.set('content-type', 'application/pdf');

    if (options?.disposition !== undefined) {
      const filename =
        options.filename === undefined
          ? ''
          : `; filename*=UTF-8''${yield* encodeHeaderFilename(options.filename)}`;

      headers.set('content-disposition', `${options.disposition}${filename}`);
    }

    return headers;
  });

/**
 * Encodes a filename for the UTF-8 Content-Disposition parameter.
 *
 * @param filename The unencoded response filename.
 * @returns The RFC 5987-compatible filename value.
 */
const encodeHeaderFilename = (filename: string): Effect.Effect<string, PdfResponseError> =>
  Effect.try({
    try: () =>
      encodeURIComponent(filename)
        .replaceAll("'", '%27')
        .replaceAll('(', '%28')
        .replaceAll(')', '%29')
        .replaceAll('*', '%2A'),
    catch: (cause) => new PdfResponseError({ cause }),
  });
