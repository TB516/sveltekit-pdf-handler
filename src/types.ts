import type { LaunchOptions, PDFOptions } from 'puppeteer';
import type { Component, ComponentProps } from 'svelte';

/**
 * Configures a PDF responder and its shared browser.
 */
export interface PdfResponderOptions {
  /** Puppeteer options used when Chromium is launched. */
  launchOptions?: LaunchOptions;

  /** Optional maximum time Chromium may spend rendering one PDF in milliseconds. */
  renderTimeoutMs?: number;
}

/**
 * Describes a font face inserted into the rendered document.
 */
export interface PdfFont {
  /** CSS font-family name. */
  family: string;

  /** Font URL, normally imported from a collocated file with Vite's `?inline` query. */
  source: string;

  /** Optional CSS font format such as `woff2`. */
  format?: string;

  /** CSS font-weight descriptor. */
  weight?: number | string;

  /** CSS font-style descriptor. */
  style?: string;

  /** CSS font-stretch descriptor. */
  stretch?: string;

  /** CSS font-display descriptor. */
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';

  /** CSS unicode-range descriptor. */
  unicodeRange?: string;

  /** CSS font-feature-settings descriptor. */
  featureSettings?: string;

  /** CSS font-variation-settings descriptor. */
  variationSettings?: string;
}

/**
 * Configures metadata on the generated PDF response.
 */
export interface PdfResponseOptions {
  /** Additional headers applied to the PDF response. */
  headers?: HeadersInit;

  /** Adds a Content-Disposition header when provided. */
  disposition?: 'inline' | 'attachment';

  /** Filename used by Content-Disposition. Requires `disposition`. */
  filename?: string;
}

/**
 * Configures the HTML document and generated PDF.
 */
export interface PdfConfig {
  /** Font faces inserted into the rendered document. */
  fonts?: readonly PdfFont[];

  /** Language placed on the generated document's `<html>` element. */
  lang?: string;

  /** Puppeteer PDF options. `printBackground` and `preferCSSPageSize` default to true. */
  pdf?: Omit<PDFOptions, 'path'>;
}

/**
 * Represents a Svelte component module namespace imported with `import * as ComponentModule`.
 *
 * @typeParam ComponentType The module's Svelte component type.
 */
export interface PdfComponentModule<ComponentType extends Component> {
  /** The module's default Svelte component export. */
  default: ComponentType;

  /** PDF configuration exported from the component's module script. */
  pdf?: PdfConfig;
}

/**
 * Extracts the props accepted by a Svelte component when rendered as a PDF.
 *
 * @typeParam ComponentType The Svelte component type whose props are extracted.
 */
export type PdfComponentProps<ComponentType extends Component> = Omit<
  ComponentProps<ComponentType>,
  '$$events' | '$$slots'
>;

/**
 * Configures one call to a PDF responder function.
 *
 * @typeParam Props Props accepted by the rendered Svelte component.
 */
export interface PdfResponseInit<Props> extends PdfConfig {
  /** Props passed to the PDF component. */
  props?: Props;

  /** PDF response metadata. */
  response?: PdfResponseOptions;
}

/**
 * Makes responder options optional only when the component has no required props.
 *
 * @typeParam Props Props accepted by the rendered Svelte component.
 */
export type PdfResponseArgs<Props> = {} extends Props
  ? [options?: PdfResponseInit<Props>]
  : [options: PdfResponseInit<Props> & { props: Props }];
