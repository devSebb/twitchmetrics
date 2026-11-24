import type { Config } from "tailwindcss";

/**
 * Shared Tailwind config wired to THEME tokens from theme.ts.
 * Colour aliases resolve the shared Noticed CSS variables.
 */
const config: Config = {
  darkMode: "class",
  content: ["../../packages/ui/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Shared web tokens.
        n: {
          canvas: "rgb(var(--noticed-canvas-rgb) / <alpha-value>)",
          ink: "rgb(var(--noticed-ink-rgb) / <alpha-value>)",
          red: {
            DEFAULT: "rgb(var(--noticed-red-rgb) / <alpha-value>)",
            hover: "rgb(var(--noticed-red-hover-rgb) / <alpha-value>)",
          },
          navy: "rgb(var(--noticed-navy-rgb) / <alpha-value>)",
          slate: "rgb(var(--noticed-slate-rgb) / <alpha-value>)",
          surface: "rgb(var(--noticed-surface-rgb) / <alpha-value>)",
          line: "rgb(var(--noticed-line-rgb) / <alpha-value>)",
          control: "rgb(var(--noticed-control-rgb) / <alpha-value>)",
          success: "rgb(var(--noticed-success-rgb) / <alpha-value>)",
          warning: "rgb(var(--noticed-warning-rgb) / <alpha-value>)",
          error: "rgb(var(--noticed-error-rgb) / <alpha-value>)",
        },
        background: "rgb(var(--noticed-canvas-rgb) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--noticed-canvas-rgb) / <alpha-value>)",
          hover: "rgb(var(--noticed-surface-rgb) / <alpha-value>)",
          elevated: "rgb(var(--noticed-surface-rgb) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--noticed-line-rgb) / <alpha-value>)",
          hover: "rgb(var(--noticed-control-rgb) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--noticed-red-rgb) / <alpha-value>)",
          hover: "rgb(var(--noticed-red-hover-rgb) / <alpha-value>)",
        },
        "text-primary": "rgb(var(--noticed-ink-rgb) / <alpha-value>)",
        "text-header": "rgb(var(--noticed-ink-rgb) / <alpha-value>)",
        "text-muted": "rgb(var(--noticed-slate-rgb) / <alpha-value>)",
        success: "rgb(var(--noticed-success-rgb) / <alpha-value>)",
        warning: "rgb(var(--noticed-warning-rgb) / <alpha-value>)",
        error: "rgb(var(--noticed-error-rgb) / <alpha-value>)",
        twitch: "#9146ff",
        youtube: "#ff0000",
        instagram: "#e4405f",
        tiktok: "#000000",
        x: "#000000",
        kick: "#53fc18",
      },
      fontFamily: {
        display: ["Golos Text", "system-ui", "sans-serif"],
        body: ["Golos Text", "system-ui", "sans-serif"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "'SF Mono'",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
