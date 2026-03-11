import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@twitchmetrics/database", "@twitchmetrics/ui"],
  images: {
    remotePatterns: [
      // Twitch CDN
      { protocol: "https", hostname: "static-cdn.jtvnw.net" },
      { protocol: "https", hostname: "*.jtvnw.net" },
      // YouTube CDN
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      // Instagram CDN
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "*.fbcdn.net" },
      // IGDB images
      { protocol: "https", hostname: "images.igdb.com" },
      // Cloudflare R2
      { protocol: "https", hostname: "*.r2.dev" },
    ],
  },
};

export default nextConfig;
