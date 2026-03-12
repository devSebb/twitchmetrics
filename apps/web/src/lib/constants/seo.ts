/** Base site URL — used for sitemap, canonical URLs, and OG meta */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://twitchmetrics.net";

export const SITE_NAME = "TwitchMetrics";

export const TWITTER_HANDLE = "@twitchmetrics";

export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

export const DEFAULT_DESCRIPTION =
  "Creator analytics platform for Twitch, YouTube, and more. Track viewership, follower growth, and streaming trends across platforms.";
