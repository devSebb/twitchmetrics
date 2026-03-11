import type { Config } from "tailwindcss";

/**
 * Shared Tailwind config wired to THEME tokens from theme.ts.
 * Color values sourced from Discord dark gray palette + brand red #E32C19.
 */
const config: Config = {
  darkMode: "class",
  content: ["../../packages/ui/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#2B2D31",
        surface: {
          DEFAULT: "#313338",
          hover: "#383A40",
          elevated: "#1E1F22",
        },
        border: {
          DEFAULT: "#3F4147",
          hover: "#4E5058",
        },
        primary: {
          DEFAULT: "#E32C19",
          hover: "#C72615",
        },
        "text-primary": "#DBDEE1",
        "text-header": "#F2F3F5",
        "text-muted": "#949BA4",
        success: "#22c55e",
        warning: "#f59e0b",
        error: "#ef4444",
        twitch: "#9146ff",
        youtube: "#ff0000",
        instagram: "#e4405f",
        tiktok: "#000000",
        x: "#000000",
        kick: "#53fc18",
      },
      fontFamily: {
        display: ["var(--font-gotham-black)", "system-ui", "sans-serif"],
        body: ["var(--font-gotham)", "system-ui", "sans-serif"],
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
