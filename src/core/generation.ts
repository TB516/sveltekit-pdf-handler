import type { RequestEvent } from '@sveltejs/kit';
import { Duration, Effect, Schema } from 'effect';
import type { Component } from 'svelte';
import { render } from 'svelte/server';

import { ComponentRenderError, PdfConfigError, PdfRenderTimeoutError } from '../errors.js';
import type { PdfComponentModule, PdfComponentProps, PdfResponseArgs } from '../types.js';
import { BrowserManager } from './browser.js';
import { PdfGenerationConfigSchema } from './config.js';
import { createPdfHtml } from './html.js';
import { renderPdf } from './render.js';
import { createPdfResponse } from './response.js';

/**
 * Generates one PDF response.
 *
 * @param renderTimeoutMs Maximum duration of the complete Puppeteer rendering operation.
 * @param event The current SvelteKit request event.
 * @param componentModule The Svelte component's complete module namespace.
 * @param args PDF options, component props, and response metadata.
 * @returns The generated PDF response.
 */
export const createResponse = <ComponentType extends Component>(
  renderTimeoutMs: number | undefined,
  event: RequestEvent,
  componentModule: PdfComponentModule<ComponentType>,
  ...[options]: PdfResponseArgs<PdfComponentProps<ComponentType>>
) =>
  Effect.gen(function* () {
    const component = componentModule.default;
    const props = options?.props ?? {};
    const lang = options?.lang ?? componentModule.pdf?.lang;
    const response = options?.response;
    const config = yield* Schema.decodeUnknownEffect(PdfGenerationConfigSchema)({
      fonts: [...(componentModule.pdf?.fonts ?? []), ...(options?.fonts ?? [])],
      ...(lang === undefined ? {} : { lang }),
      ...(response === undefined ? {} : { response }),
    }).pipe(Effect.mapError((cause) => new PdfConfigError({ cause })));
    const pdfOptions = { ...componentModule.pdf?.pdf, ...options?.pdf };

    const { body, head } = yield* Effect.try({
      try: () => render(component as Component, { props }),
      catch: (cause) => new ComponentRenderError({ cause }),
    });

    const html = createPdfHtml({
      baseUrl: event.url,
      body,
      fonts: config.fonts,
      head,
      lang: config.lang,
    });

    const browserManager = yield* BrowserManager;
    const browser = yield* browserManager.getBrowser;

    const rendering = renderPdf({
      browser,
      event,
      html,
      pdfOptions,
    });

    let pdfBytes: Uint8Array;

    if (renderTimeoutMs === undefined) {
      pdfBytes = yield* rendering;
    } else {
      pdfBytes = yield* rendering.pipe(
        Effect.timeoutOrElse({
          duration: Duration.millis(renderTimeoutMs),
          orElse: () => Effect.fail(new PdfRenderTimeoutError({ timeoutMs: renderTimeoutMs })),
        }),
      );
    }

    return yield* createPdfResponse(pdfBytes, options?.response);
  });
