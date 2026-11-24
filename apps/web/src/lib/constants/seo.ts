/** Base site URL — used for sitemap, canonical URLs, and OG meta */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://twitchmetrics.net";

export const SITE_NAME = "Noticed";

export const TWITTER_HANDLE = "@twitchmetrics";

export const DEFAULT_OG_IMAGE = `${SITE_URL}/opengraph-image`;

export const DEFAULT_DESCRIPTION =
  "Free creator media kits and analytics, powered by Hatchet. Bring your audience, platforms and performance together in one public link.";
