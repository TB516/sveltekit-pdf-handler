import type { RequestEvent } from '@sveltejs/kit';
import type { HTTPRequest, PDFOptions } from 'puppeteer';

import { createBrowserSession } from './browser.js';

interface PdfRenderOptions {
  event: RequestEvent;
  html: string;
  pdfOptions: Omit<PDFOptions, 'path'> | undefined;
}

/**
 * Renders a complete HTML document to PDF in an isolated page of a shared browser.
 *
 * @param options The request, HTML document, and Puppeteer options used for the render.
 * @returns The generated PDF bytes.
 */
export const renderPdf = async ({
  event,
  html,
  pdfOptions,
}: PdfRenderOptions): Promise<Uint8Array> => {
  const { context, page } = await createBrowserSession();
  let assetError: unknown;

  /**
   * Loads an intercepted browser request through SvelteKit when it is same-origin.
   *
   * @param request The intercepted Puppeteer request.
   * @returns A promise that resolves after the request is continued, fulfilled, or aborted.
   */
  const handleAssetRequest = async (request: HTTPRequest): Promise<void> => {
    try {
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
    } catch (error) {
      assetError ??= error;
      await request.abort('failed').catch(() => undefined);
    }
  };

  try {
    await page.setRequestInterception(true);
    page.on('request', handleAssetRequest);

    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForNetworkIdle();
    await page.evaluate(() => document.fonts.ready);

    if (assetError !== undefined) {
      throw assetError;
    }

    return await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      ...pdfOptions,
    });
  } finally {
    await context.close();
  }
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
