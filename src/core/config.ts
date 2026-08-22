import { Schema } from 'effect';

/** Validates a font face inserted into a rendered document. */
const PdfFontSchema = Schema.Struct({
  /** CSS font-family name. */
  family: Schema.NonEmptyString,

  /** Font URL, normally imported from a collocated file with Vite's `?inline` query. */
  source: Schema.NonEmptyString,

  /** Optional CSS font format such as `woff2`. */
  format: Schema.optionalKey(Schema.NonEmptyString),

  /** CSS font-weight descriptor. */
  weight: Schema.optionalKey(
    Schema.Union([
      Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
      Schema.NonEmptyString,
    ]),
  ),

  /** CSS font-style descriptor. */
  style: Schema.optionalKey(Schema.NonEmptyString),

  /** CSS font-stretch descriptor. */
  stretch: Schema.optionalKey(Schema.NonEmptyString),

  /** CSS font-display descriptor. */
  display: Schema.optionalKey(Schema.Literals(['auto', 'block', 'swap', 'fallback', 'optional'])),

  /** CSS unicode-range descriptor. */
  unicodeRange: Schema.optionalKey(Schema.NonEmptyString),

  /** CSS font-feature-settings descriptor. */
  featureSettings: Schema.optionalKey(Schema.NonEmptyString),

  /** CSS font-variation-settings descriptor. */
  variationSettings: Schema.optionalKey(Schema.NonEmptyString),
});

/** Describes a validated font face inserted into a rendered document. */
export type PdfFont = Schema.Schema.Type<typeof PdfFontSchema>;

/** Validates metadata owned by a generated PDF response. */
const PdfResponseMetadataSchema = Schema.Struct({
  /** Adds a Content-Disposition header when provided. */
  disposition: Schema.optionalKey(Schema.Literals(['inline', 'attachment'])),

  /** Filename used by Content-Disposition. Requires `disposition`. */
  filename: Schema.optionalKey(Schema.NonEmptyString),
}).check(
  Schema.makeFilter((metadata) =>
    metadata.filename === undefined || metadata.disposition !== undefined
      ? undefined
      : { path: ['filename'], issue: 'filename requires disposition' },
  ),
);

/** Validated metadata owned by a generated PDF response. */
export type PdfResponseMetadata = Schema.Schema.Type<typeof PdfResponseMetadataSchema>;

/** Validates library-owned configuration for one PDF generation. */
export const PdfGenerationConfigSchema = Schema.Struct({
  fonts: Schema.Array(PdfFontSchema),
  lang: Schema.optionalKey(Schema.NonEmptyString),
  response: Schema.optionalKey(PdfResponseMetadataSchema),
});

/** Validates configuration owned by the PDF responder. */
export const ResponderConfigSchema = Schema.Struct({
  /** Number of times to retry a failed Chromium launch. */
  browserLaunchRetries: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),

  /** Maximum number of PDF generations allowed to run concurrently. */
  maxConcurrentGenerations: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),

  /** Maximum duration of one complete Puppeteer rendering operation in milliseconds. */
  renderTimeoutMs: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
});

/** Configuration values owned and validated by the PDF responder. */
export type ResponderConfig = Schema.Schema.Type<typeof ResponderConfigSchema>;
