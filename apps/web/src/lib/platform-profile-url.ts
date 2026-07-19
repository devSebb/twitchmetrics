import type { Platform } from "@twitchmetrics/database";

const PLATFORM_PROFILE_HOSTS = {
  twitch: ["twitch.tv"],
  youtube: ["youtube.com"],
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  x: ["x.com", "twitter.com"],
  kick: ["kick.com"],
} as const satisfies Record<Platform, readonly string[]>;

function matchesHost(hostname: string, allowedHost: string) {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}

export function getSafePlatformProfileUrl(
  platform: Platform,
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const isExpectedPlatform = PLATFORM_PROFILE_HOSTS[platform].some((host) =>
      matchesHost(hostname, host),
    );

    return isExpectedPlatform ? url.toString() : null;
  } catch {
    return null;
  }
}
