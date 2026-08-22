import type { RequestEvent } from '@sveltejs/kit';
import { Deferred, Effect, Schema, Semaphore } from 'effect';
import type { Component } from 'svelte';

import type {
  BrowserCloseError,
  BrowserLaunchError,
  ComponentRenderError,
  PdfConfigError,
  PdfRenderError,
  PdfRenderTimeoutError,
  PdfResponseError,
} from '../errors.js';
import { PdfResponderConfigError, PdfResponderDisposedError } from '../errors.js';
import type {
  PdfComponentModule,
  PdfComponentProps,
  PdfResponderOptions,
  PdfResponseArgs,
} from '../types.js';
import { BrowserManager, createBrowserManager } from './browser.js';
import { ResponderConfigSchema } from './config.js';
import { createResponse } from './generation.js';

/** Errors that can prevent a PDF response from being generated. */
export type PdfGenerationError =
  | BrowserLaunchError
  | ComponentRenderError
  | PdfConfigError
  | PdfRenderError
  | PdfRenderTimeoutError
  | PdfResponderDisposedError
  | PdfResponseError;

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
   * @returns The generated PDF response.
   */
  <ComponentType extends Component>(
    event: RequestEvent,
    componentModule: PdfComponentModule<ComponentType>,
    ...args: PdfResponseArgs<PdfComponentProps<ComponentType>>
  ): Effect.Effect<Response, PdfGenerationError>;

  /** Returns the number of queued or active generations currently owned by this responder. */
  getPendingGenerations(): number;

  /** Completes after accepted responses settle and the browser closes. */
  readonly dispose: Effect.Effect<void, BrowserCloseError>;
}

/**
 * Creates a PDF responder backed by one lazily launched Chromium process.
 *
 * @param responderOptions Browser launch, concurrency, and rendering timeout options.
 * @returns A configured PDF responder.
 */
export const createPdfResponder = (
  responderOptions: PdfResponderOptions = {},
): Effect.Effect<PdfResponder, PdfResponderConfigError> =>
  Effect.gen(function* () {
    const config = yield* Schema.decodeUnknownEffect(ResponderConfigSchema)(responderOptions).pipe(
      Effect.mapError((cause) => new PdfResponderConfigError({ cause })),
    );

    const browserManager = yield* createBrowserManager(
      responderOptions.launchOptions ?? {},
      config.browserLaunchRetries,
      config.browserLaunchRetryMaxDelayMs,
    );

    const semaphore =
      config.maxConcurrentGenerations === undefined
        ? undefined
        : yield* Semaphore.make(config.maxConcurrentGenerations);
    const pendingGenerations = new Set<Deferred.Deferred<void>>();
    let disposed = false;

    /** Generates and tracks one PDF response. */
    const respond = <ComponentType extends Component>(
      event: RequestEvent,
      componentModule: PdfComponentModule<ComponentType>,
      ...args: PdfResponseArgs<PdfComponentProps<ComponentType>>
    ) => {
      const generation = Effect.acquireUseRelease(
        Effect.gen(function* () {
          const completed = yield* Deferred.make<void>();

          if (disposed) {
            return yield* new PdfResponderDisposedError();
          }

          pendingGenerations.add(completed);
          return completed;
        }),
        () => {
          const response = createResponse(
            config.renderTimeoutMs,
            event,
            componentModule,
            ...args,
          ).pipe(Effect.provideService(BrowserManager, browserManager));

          if (!semaphore) {
            return response;
          }

          return semaphore.withPermit(response);
        },
        (completed) =>
          Effect.gen(function* () {
            pendingGenerations.delete(completed);
            yield* Deferred.succeed(completed, undefined);
          }),
      );

      const requestSignal = event.request.signal;
      const requestAborted = Effect.callback<never>((resume) => {
        const interrupt = (): void => {
          resume(Effect.interrupt);
        };

        if (requestSignal.aborted) {
          interrupt();
          return;
        }

        requestSignal.addEventListener('abort', interrupt, { once: true });
        return Effect.sync(() => requestSignal.removeEventListener('abort', interrupt));
      });

      return Effect.gen(function* () {
        if (disposed) {
          return yield* new PdfResponderDisposedError();
        }

        return yield* Effect.raceFirst(generation, requestAborted);
      });
    };

    /** Drains accepted responses and closes the browser. */
    const dispose = Effect.gen(function* () {
      const pending = yield* Effect.sync(() => {
        disposed = true;
        return [...pendingGenerations];
      });

      yield* Effect.all(pending.map(Deferred.await), { concurrency: 'unbounded' });
      yield* browserManager.closeBrowser;
    });

    return Object.assign(respond, {
      dispose: yield* Effect.cached(Effect.uninterruptible(dispose)),
      getPendingGenerations: (): number => pendingGenerations.size,
    });
  });
