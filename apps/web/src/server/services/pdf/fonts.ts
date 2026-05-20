import { Font } from "@react-pdf/renderer";

export const PDF_FONT_FAMILY = "Gotham Rounded";
export const PDF_DISPLAY_FONT_FAMILY = "Gotham Ultra";

let registered = false;

/**
 * Register the app's Gotham fonts with @react-pdf/renderer.
 *
 * Fonts are served from /public/fonts/. We register once per Node process —
 * @react-pdf caches font binaries internally, but its registration table is
 * keyed by family + weight, so re-registering is a no-op anyway. The guard
 * just skips the I/O round-trip on subsequent renders.
 */
export function registerPdfFonts(baseUrl: string): void {
  if (registered) return;
  const trimmed = baseUrl.replace(/\/$/, "");

  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: `${trimmed}/fonts/gotham-rounded-book.otf`, fontWeight: 400 },
      { src: `${trimmed}/fonts/gotham-rounded-medium.otf`, fontWeight: 500 },
      { src: `${trimmed}/fonts/gotham-rounded-bold.otf`, fontWeight: 700 },
    ],
  });

  Font.register({
    family: PDF_DISPLAY_FONT_FAMILY,
    fonts: [{ src: `${trimmed}/fonts/Gotham-Ultra.otf`, fontWeight: 900 }],
  });

  registered = true;
}
