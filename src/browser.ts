import { launch, type Browser, type BrowserContext, type Page } from 'puppeteer';

let browserPromise: Promise<Browser> | undefined;

export interface BrowserSession {
  context: BrowserContext;
  page: Page;
}

/**
 * Creates an isolated context and page in the Chromium process shared by all PDF handlers.
 *
 * @returns A browser session containing the isolated context and page.
 */
export const createBrowserSession = async (): Promise<BrowserSession> => {
  const browser = await getSharedBrowser();
  const context = await browser.createBrowserContext();

  try {
    const page = await context.newPage();
    return { context, page };
  } catch (error) {
    await context.close();
    throw error;
  }
};

/**
 * Returns the shared Chromium process, launching it when needed.
 *
 * @returns A connected Puppeteer browser.
 */
const getSharedBrowser = async (): Promise<Browser> => {
  if (browserPromise !== undefined) {
    return browserPromise;
  }

  const launchPromise = launch();
  browserPromise = launchPromise;

  try {
    const browser = await launchPromise;
    browser.once('disconnected', () => {
      browserPromise = undefined;
    });
    return browser;
  } catch (error) {
    browserPromise = undefined;
    throw error;
  }
};
