import { NOTICED } from "./noticed";

/** Shared presentation tokens for the Noticed web and export surfaces. */
export const THEME = {
  colors: {
    // Surfaces
    background: NOTICED.canvas,
    surface: NOTICED.canvas,
    surfaceHover: NOTICED.surface,
    surfaceElevated: NOTICED.surface,
    border: NOTICED.line,
    borderHover: NOTICED.control,

    // Text
    text: NOTICED.ink,
    textHeader: NOTICED.ink,
    textMuted: NOTICED.slate,

    // Brand
    brandRed: NOTICED.red,
    brandRedHover: NOTICED.redHover,

    // Semantic
    success: NOTICED.success,
    warning: NOTICED.warning,
    error: NOTICED.error,

    // Platform
    twitch: "#9146ff",
    youtube: "#ff0000",
    instagram: "#e4405f",
    tiktok: "#69C9D0",
    x: "#F2F3F5",
    kick: "#53fc18",
  },

  fontSize: {
    xs: "0.75rem", // 12px
    sm: "0.875rem", // 14px
    base: "1rem", // 16px
    lg: "1.125rem", // 18px
    xl: "1.25rem", // 20px
    "2xl": "1.5rem", // 24px
    "3xl": "1.875rem", // 30px
    "4xl": "2.25rem", // 36px
  },

  fontFamily: {
    display: NOTICED.font,
    body: NOTICED.font,
    mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
  },

  spacing: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
    16: "64px",
  },

  borderRadius: {
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
  },
} as const;

export type Theme = typeof THEME;
