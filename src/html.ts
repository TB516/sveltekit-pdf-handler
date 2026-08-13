import type { PdfFont } from './types.js';

/**
 * Provides the content and metadata used to construct a PDF document's HTML.
 */
interface PdfHtmlOptions {
  /** Base URL used to resolve relative document assets. */
  baseUrl: URL;

  /** Rendered Svelte body markup. */
  body: string;

  /** Font faces inserted into the document. */
  fonts: readonly PdfFont[];

  /** Rendered Svelte head markup. */
  head: string;

  /** Optional language placed on the document's `<html>` element. */
  lang: string | undefined;
}

/**
 * Creates the complete HTML document loaded by Chromium.
 *
 * @param options The document base URL, rendered content, fonts, and language.
 * @returns A complete HTML document.
 */
export const createPdfHtml = ({ baseUrl, body, fonts, head, lang }: PdfHtmlOptions): string => {
  const fontFaceCss = fonts.map(createFontFaceCss).join('');
  const langAttribute = lang === undefined ? '' : ` lang=${quoteHtmlAttribute(lang)}`;

  return `
    <!doctype html>
    <html${langAttribute}>
      <head>
        <base href=${quoteHtmlAttribute(baseUrl.href)}>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        ${fontFaceCss === '' ? '' : `<style data-sveltekit-pdf-fonts>${fontFaceCss}</style>`}
        ${head}
      </head>
      <body>
        ${body}
      </body>
    </html>`;
};

/**
 * Converts a font configuration into a CSS font-face rule.
 *
 * @param font The configured font source and descriptors.
 * @returns A CSS font-face rule.
 */
const createFontFaceCss = (font: PdfFont): string => {
  const fontDescriptors = [
    ['font-weight', font.weight],
    ['font-style', font.style],
    ['font-stretch', font.stretch],
    ['font-display', font.display],
    ['unicode-range', font.unicodeRange],
    ['font-feature-settings', font.featureSettings],
    ['font-variation-settings', font.variationSettings],
  ] as const;
  const fontSource = `url(${quoteCssString(font.source)})${font.format === undefined ? '' : ` format(${quoteCssString(font.format)})`}`;
  const fontDeclarations = fontDescriptors
    .filter((descriptor) => descriptor[1] !== undefined)
    .map(([name, value]) => `${name}:${String(value)};`)
    .join('');

  return `@font-face{font-family:${quoteCssString(font.family)};src:${fontSource};${fontDeclarations}}`;
};

/**
 * Escapes a value for use as a quoted CSS string.
 *
 * @param value The unescaped string value.
 * @returns A quoted CSS string.
 */
const quoteCssString = (value: string): string => {
  return `"${value.replace(/["\\\n\r\f<>]/g, (character) => {
    if (character === '"' || character === '\\') return `\\${character}`;
    return `\\${character.charCodeAt(0).toString(16)} `;
  })}"`;
};

/**
 * Escapes a value for use as a quoted HTML attribute.
 *
 * @param value The unescaped attribute value.
 * @returns A quoted HTML attribute value.
 */
const quoteHtmlAttribute = (value: string): string => {
  return `"${value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')}"`;
};
