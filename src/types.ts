import type { LaunchOptions, PDFOptions } from 'puppeteer';
import type { Component, ComponentProps } from 'svelte';

import type { PdfFont, PdfResponseMetadata, ResponderConfig } from './core/config.js';

/**
 * Configures a PDF responder and its shared browser.
 */
export interface PdfResponderOptions extends ResponderConfig {
  /** Puppeteer options used when Chromium is launched. */
  launchOptions?: LaunchOptions;
}

export type { PdfFont } from './core/config.js';

/**
 * Configures metadata on the generated PDF response.
 */
export interface PdfResponseOptions extends PdfResponseMetadata {
  /** Additional headers applied to the PDF response. */
  headers?: HeadersInit;
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
