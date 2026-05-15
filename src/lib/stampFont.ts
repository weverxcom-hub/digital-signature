import fs from "node:fs";
import path from "node:path";

/**
 * Read and base64-encode the bundled Inter TTF files once at module load.
 *
 * Why bundle a font at all?
 * The stamp PNG is rendered server-side by sharp / librsvg. On Vercel's
 * serverless Linux runtime, the SVG `font-family` stack we used to ship
 * ("system-ui, Segoe UI, Roboto, …") matched *none* of the installed
 * fonts, so librsvg fell back to a default with missing glyphs and the
 * stamp text rendered as tofu boxes (□□□).
 *
 * Embedding the font directly into the SVG via `@font-face` with a
 * `data:` URL guarantees identical rendering regardless of which host
 * fonts happen to be installed.
 */

let cached: { regular: string; bold: string } | null = null;

function loadFonts(): { regular: string; bold: string } {
  if (cached) return cached;
  // process.cwd() points at the project root in both `next dev` and the
  // built serverless function. The font files are committed under
  // `public/fonts/` so they ship with the deployment without us having
  // to wire up a webpack/asset import.
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  const regular = fs
    .readFileSync(path.join(fontsDir, "Inter-Regular.ttf"))
    .toString("base64");
  const bold = fs
    .readFileSync(path.join(fontsDir, "Inter-Bold.ttf"))
    .toString("base64");
  cached = { regular, bold };
  return cached;
}

/**
 * Returns an SVG `<style>` block declaring "Inter" as a webfont so any
 * `<text font-family="Inter">` element renders with the bundled font.
 */
export function stampFontStyleBlock(): string {
  const { regular, bold } = loadFonts();
  return `<style>
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 400;
      src: url(data:font/ttf;base64,${regular}) format('truetype');
    }
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 700;
      src: url(data:font/ttf;base64,${bold}) format('truetype');
    }
  </style>`;
}

/**
 * Font family value to use in SVG text elements. Inter is the bundled
 * primary; the fallbacks cover the rare case where the bundled font
 * fails to decode (mostly a sanity net — we test the bundled font in CI).
 */
export const STAMP_FONT_FAMILY =
  "Inter, 'DejaVu Sans', 'Liberation Sans', sans-serif";
