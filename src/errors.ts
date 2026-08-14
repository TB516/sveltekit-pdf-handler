import { Data } from 'effect';

/** Indicates that Puppeteer could not launch Chromium. */
export class BrowserLaunchError extends Data.TaggedError('BrowserLaunchError')<{
  readonly cause: unknown;
}> {
  override readonly message = 'Failed to launch the browser for PDF generation';
}

/** Indicates that Svelte could not render the component. */
export class ComponentRenderError extends Data.TaggedError('ComponentRenderError')<{
  readonly cause: unknown;
}> {
  override readonly message = 'Failed to render the Svelte component';
}

/** Indicates that Puppeteer could not render the generated document as a PDF. */
export class PdfRenderError extends Data.TaggedError('PdfRenderError')<{
  readonly cause: unknown;
}> {
  override readonly message = 'Failed to render the PDF document';
}
