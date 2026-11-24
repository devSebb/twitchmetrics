import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const PDF_FONT_FAMILY = "Golos Text";
export const PDF_DISPLAY_FONT_FAMILY = "Golos Display";
const FONTS_DIR = path.join(process.cwd(), "public", "fonts");
let registered = false;

/** Embed local static instances so PDF layout does not depend on network fonts. */
export function registerPdfFonts(): void {
  if (registered) return;
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: path.join(FONTS_DIR, "golos-text-regular.ttf"), fontWeight: 400 },
      { src: path.join(FONTS_DIR, "golos-text-medium.ttf"), fontWeight: 500 },
      { src: path.join(FONTS_DIR, "golos-text-bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: PDF_DISPLAY_FONT_FAMILY,
    src: path.join(FONTS_DIR, "golos-text-extrabold.ttf"),
  });
  registered = true;
}
