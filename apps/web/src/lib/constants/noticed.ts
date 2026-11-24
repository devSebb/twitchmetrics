import type { CSSProperties } from "react";

/** Shared values for DOM, canvas charts and export presentation. */
export const NOTICED = {
  canvas: "#FFFFFF",
  ink: "#151F2C",
  red: "#C4262C",
  redHover: "#A91F25",
  navy: "#022658",
  slate: "#4A505B",
  surface: "#EFEFEF",
  line: "#D9D9D9",
  control: "#D2D5D7",
  success: "#167044",
  warning: "#895C0A",
  error: "#B4232B",
  font: '"Golos Text", system-ui, sans-serif',
} as const;

export const NOTICED_CSS_VARS = Object.fromEntries(
  Object.entries(NOTICED).flatMap(([name, value]) => {
    const variable = `--noticed-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    // Tailwind's opacity modifiers need RGB channels. Keep the resolved hex
    // tokens alongside them for handwritten CSS, canvas and PDF consumers.
    const entries = [[variable, value]];
    if (/^#[\da-f]{6}$/i.test(value)) {
      entries.push([
        `${variable}-rgb`,
        [1, 3, 5]
          .map((offset) => parseInt(value.slice(offset, offset + 2), 16))
          .join(" "),
      ]);
    }
    return entries;
  }),
) as CSSProperties;

/** Adjusted for legibility on white; platform marks keep their original assets. */
export const NOTICED_CHART_COLORS = {
  twitch: "#7C3AD1",
  youtube: "#C4262C",
  instagram: "#B72C69",
  tiktok: "#087D88",
  x: "#151F2C",
  kick: "#34821B",
} as const;
