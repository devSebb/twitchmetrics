import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const PDF_FONT_FAMILY = "Gotham Rounded";
export const PDF_DISPLAY_FONT_FAMILY = "Gotham Ultra";

const FONTS_DIR = path.join(process.cwd(), "public", "fonts");

const ROUNDED_VARIANTS = [
  { file: "gotham-rounded-book.otf", fontWeight: 400 },
  { file: "gotham-rounded-medium.otf", fontWeight: 500 },
  { file: "gotham-rounded-bold.otf", fontWeight: 700 },
] as const;

let registered = false;

/**
 * Register the app's Gotham fonts with @react-pdf/renderer.
 *
 * Fonts are referenced by absolute filesystem path under `public/fonts/`, so
 * @react-pdf reads them directly off the deployment bundle instead of fetching
 * them back over HTTPS. This keeps PDF rendering independent of the site URL,
 * Vercel deployment protection, and the network in general. The library caches
 * font binaries internally; the `registered` flag just skips re-registration.
 */
export function registerPdfFonts(): void {
  if (registered) return;

  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: ROUNDED_VARIANTS.map(({ file, fontWeight }) => ({
      src: path.join(FONTS_DIR, file),
      fontWeight,
    })),
  });

  Font.register({
    family: PDF_DISPLAY_FONT_FAMILY,
    fonts: [
      {
        src: path.join(FONTS_DIR, "Gotham-Ultra.otf"),
        fontWeight: 900,
      },
    ],
  });

  registered = true;
}
