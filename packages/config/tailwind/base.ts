import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: "class",
  content: [
    "../../packages/ui/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        surface: "#111111",
        "surface-elevated": "#1a1a1a",
        border: "#2a2a2a",
        "border-hover": "#3a3a3a",
        primary: "#e53e2f",
        "primary-hover": "#cc3528",
        "primary-muted": "#e53e2f20",
        "text-primary": "#ffffff",
        "text-secondary": "#a0a0a0",
        "text-muted": "#606060",
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
    },
  },
  plugins: [],
}

export default config
