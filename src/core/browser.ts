import { Cache, Context, Duration, Effect, Exit, Option } from 'effect';
import { launch, type Browser, type LaunchOptions } from 'puppeteer';

import { BrowserCloseError, BrowserLaunchError } from '../errors.js';

/** Browser operations owned by one PDF responder. */
export interface BrowserManager {
  /** Closes and invalidates the cached browser without launching one. */
  readonly closeBrowser: Effect.Effect<void, BrowserCloseError>;

  /** Returns the cached browser, launching or replacing it when needed. */
  readonly getBrowser: Effect.Effect<Browser, BrowserLaunchError>;
}

/** Browser manager dependency owned by a PDF responder. */
export const BrowserManager = Context.Service<BrowserManager>(
  'sveltekit-pdf-renderer/BrowserManager',
);

/**
 * Creates the shared browser operations used by one PDF responder.
 *
 * @param launchOptions Puppeteer options used when Chromium is launched.
 * @returns Operations for acquiring and closing the responder's browser.
 */
export const createBrowserManager = (launchOptions: LaunchOptions): Effect.Effect<BrowserManager> =>
  Effect.gen(function* () {
    const browserCacheKey = 'browser' as const;
    const browserCache = yield* Cache.makeWith(
      () =>
        Effect.uninterruptible(
          Effect.tryPromise({
            try: () => launch(launchOptions),
            catch: (cause) => new BrowserLaunchError({ cause }),
          }),
        ),
      {
        capacity: 1,
        timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
      },
    );

    /** Returns the cached browser, launching or replacing it when needed. */
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

    /** Closes and invalidates the cached browser without launching one. */
    const closeBrowser: Effect.Effect<void, BrowserCloseError> = Effect.gen(function* () {
      const cachedBrowser = yield* Cache.getOption(browserCache, browserCacheKey).pipe(
        Effect.catchTag('BrowserLaunchError', () => Effect.succeedNone),
      );

      if (Option.isSome(cachedBrowser)) {
        yield* Effect.tryPromise({
          try: () => cachedBrowser.value.close(),
          catch: (cause) => new BrowserCloseError({ cause }),
        }).pipe(Effect.ensuring(Cache.invalidate(browserCache, browserCacheKey)));
      } else {
        yield* Cache.invalidate(browserCache, browserCacheKey);
      }
    });

    return { closeBrowser, getBrowser } as const;
  });
