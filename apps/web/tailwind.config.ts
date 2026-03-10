import type { Config } from "tailwindcss"
import baseConfig from "@twitchmetrics/config/tailwind/base"

const config: Config = {
  ...baseConfig,
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/**/*.{ts,tsx}",
  ],
}

export default config
