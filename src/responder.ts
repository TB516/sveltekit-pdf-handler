import type { RequestEvent } from '@sveltejs/kit';
import { Effect } from 'effect';
import type { Component } from 'svelte';

import { createPdfResponder as createNativePdfResponder } from './core/responder.js';
import type {
  PdfComponentModule,
  PdfComponentProps,
  PdfResponderOptions,
  PdfResponseArgs,
} from './types.js';

/** Generates PDF responses through one managed browser. */
export interface PdfResponder {
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
   * @returns A promise containing the generated PDF response.
   * @throws {PdfResponderDisposedError} The responder has already been disposed.
   * @throws {ComponentRenderError} Svelte could not render the component.
   * @throws {PdfConfigError} The PDF configuration is invalid.
   * @throws {BrowserLaunchError} Puppeteer could not launch Chromium.
   * @throws {PdfRenderError} Puppeteer could not render the PDF document.
   * @throws {PdfRenderTimeoutError} PDF rendering exceeded the configured time limit.
   * @throws {PdfResponseError} The generated PDF response could not be created.
   */
  <ComponentType extends Component>(
    event: RequestEvent,
    componentModule: PdfComponentModule<ComponentType>,
    ...args: PdfResponseArgs<PdfComponentProps<ComponentType>>
  ): Promise<Response>;

  /**
   * Waits for accepted renders to settle and then closes this responder's browser.
   *
   * Calling this method more than once shares the same disposal operation.
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
 * @param responderOptions Browser launch, concurrency, and rendering timeout options.
 * @returns A configured PDF responder function.
 * @throws {PdfResponderConfigError} The responder configuration is invalid.
 */
export const createPdfResponder = (responderOptions: PdfResponderOptions = {}): PdfResponder => {
  const nativeResponder = Effect.runSync(createNativePdfResponder(responderOptions));

  const responder = (<ComponentType extends Component>(
    event: RequestEvent,
    componentModule: PdfComponentModule<ComponentType>,
    ...args: PdfResponseArgs<PdfComponentProps<ComponentType>>
  ): Promise<Response> =>
    Effect.runPromise(nativeResponder(event, componentModule, ...args), {
      signal: event.request.signal,
    })) as PdfResponder;

  const dispose = (): Promise<void> => Effect.runPromise(nativeResponder.dispose);

  responder.dispose = dispose;
  responder[Symbol.asyncDispose] = dispose;

  return responder;
};
