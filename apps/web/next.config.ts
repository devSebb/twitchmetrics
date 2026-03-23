import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@twitchmetrics/database", "@twitchmetrics/ui"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value:
              "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io; style-src 'self' 'unsafe-inline'; connect-src 'self' https: wss:; font-src 'self' data: https:;",
          },
        ],
      },
    ];
  },
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
      // GitHub avatars
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      // Cloudflare R2
      { protocol: "https", hostname: "*.r2.dev" },
    ],
  },
};

const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

export default sentryOrg && sentryProject
  ? withSentryConfig(nextConfig, {
      org: sentryOrg,
      project: sentryProject,
      authToken: process.env.SENTRY_AUTH_TOKEN ?? "",
      silent: true,
      sourcemaps: { disable: true },
    })
  : nextConfig;
