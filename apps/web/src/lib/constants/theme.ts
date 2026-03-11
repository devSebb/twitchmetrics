/**
 * Design tokens for the TwitchMetrics design system.
 * Discord dark gray palette + brand red #E32C19, Gotham typography.
 */

export const THEME = {
  colors: {
    // Discord dark gray palette
    background: "#2B2D31", // Discord sidebar
    surface: "#313338", // Discord chat bg
    surfaceHover: "#383A40", // Input bg
    surfaceElevated: "#1E1F22", // Darkest
    border: "#3F4147",
    borderHover: "#4E5058",

    // Text
    text: "#DBDEE1",
    textHeader: "#F2F3F5",
    textMuted: "#949BA4",

    // Brand
    brandRed: "#E32C19",
    brandRedHover: "#C72615",

    // Semantic
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",

    // Platform
    twitch: "#9146ff",
    youtube: "#ff0000",
    instagram: "#e4405f",
    tiktok: "#000000",
    x: "#000000",
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
    display: "var(--font-gotham-black), system-ui, sans-serif",
    body: "var(--font-gotham), system-ui, sans-serif",
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
