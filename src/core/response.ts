import { Effect } from 'effect';

import { PdfResponseError } from '../errors.js';
import type { PdfResponseOptions } from '../types.js';

/**
 * Creates an HTTP response containing the generated PDF.
 *
 * @param pdfBytes The generated PDF bytes.
 * @param options The configured response headers and content disposition.
 * @returns The PDF response.
 */
export const createPdfResponse = (
  pdfBytes: Uint8Array,
  options: PdfResponseOptions | undefined,
): Effect.Effect<Response, PdfResponseError> =>
  Effect.gen(function* () {
    const headers = yield* createPdfHeaders(options);

    return yield* Effect.try({
      try: () =>
        new Response(Uint8Array.from(pdfBytes).buffer, {
          headers,
        }),
      catch: (cause) => new PdfResponseError({ cause }),
    });
  });

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

    if (options?.disposition === undefined) {
      return headers;
    }

    if (options.filename === undefined) {
      headers.set('content-disposition', options.disposition);
      return headers;
    }

    const filename = yield* encodeHeaderFilename(options.filename);
    headers.set('content-disposition', `${options.disposition}; filename*=UTF-8''${filename}`);

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
