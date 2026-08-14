import { Data } from 'effect';

/** Indicates that Puppeteer could not launch Chromium. */
export class BrowserLaunchError extends Data.TaggedError('BrowserLaunchError')<{
  readonly cause: unknown;
}> {
  override readonly message = 'Failed to launch the browser for PDF generation';
}

/** Indicates that Puppeteer could not close Chromium. */
export class BrowserCloseError extends Data.TaggedError('BrowserCloseError')<{
  readonly cause: unknown;
}> {
  override readonly message = 'Failed to close the browser used for PDF generation';
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

/** Indicates that the generated PDF response could not be created. */
export class PdfResponseError extends Data.TaggedError('PdfResponseError')<{
  readonly cause: unknown;
}> {
  override readonly message = 'Failed to create the PDF response';
}

/** Indicates that a PDF generation was requested after its responder was disposed. */
export class PdfResponderDisposedError extends Data.TaggedError('PdfResponderDisposedError')<{}> {
  override readonly message = 'Cannot generate a PDF with a disposed responder';
}
