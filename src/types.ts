import type { PDFOptions } from 'puppeteer';
import type { Component, ComponentProps } from 'svelte';

export interface PdfFont {
  /** CSS font-family name. */
  family: string;

  /** Font URL, normally imported from a collocated file with Vite's `?inline` query. */
  source: string;

  /** Optional CSS font format such as `woff2`. */
  format?: string;

  weight?: number | string;
  style?: string;
  stretch?: string;
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  unicodeRange?: string;
  featureSettings?: string;
  variationSettings?: string;
}

export interface PdfResponseOptions {
  /** Additional headers applied to the PDF response. */
  headers?: HeadersInit;

  /** Adds a Content-Disposition header when provided. */
  disposition?: 'inline' | 'attachment';

  /** Filename used by Content-Disposition. Requires `disposition`. */
  filename?: string;
}

export interface PdfConfig {
  /** Font faces inserted into the rendered document. */
  fonts?: readonly PdfFont[];

  /** Language placed on the generated document's `<html>` element. */
  lang?: string;

  /** Puppeteer PDF options. `printBackground` and `preferCSSPageSize` default to true. */
  pdf?: Omit<PDFOptions, 'path'>;
}

/** A Svelte component module namespace imported with `import * as ComponentModule`. */
export interface PdfComponentModule<ComponentType extends Component<any>> {
  /** The module's default Svelte component export. */
  default: ComponentType;

  /** PDF configuration exported from the component's module script. */
  pdf?: PdfConfig;
}

/** Props accepted by a Svelte component when rendered as a PDF. */
export type PdfComponentProps<ComponentType extends Component<any>> = Omit<
  ComponentProps<ComponentType>,
  '$$events' | '$$slots'
>;

/** Options passed to `createPdfResponse`. */
export interface PdfResponseInit<Props> extends PdfConfig {
  /** Props passed to the PDF component. */
  props?: Props;

  /** PDF response metadata. */
  response?: PdfResponseOptions;
}

/** Makes response options optional only when the component has no required props. */
export type PdfResponseArgs<Props> = {} extends Props
  ? [options?: PdfResponseInit<Props>]
  : [options: PdfResponseInit<Props> & { props: Props }];
