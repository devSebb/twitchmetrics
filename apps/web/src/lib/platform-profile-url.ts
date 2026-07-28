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

/** Platforms whose profile URL can be derived from a bare handle. YouTube is
 *  excluded — its `platformUsername` is often a display name, not a handle. */
const PLATFORM_USERNAME_URL: Partial<
  Record<Platform, (handle: string) => string>
> = {
  twitch: (h) => `https://twitch.tv/${h}`,
  kick: (h) => `https://kick.com/${h}`,
  x: (h) => `https://x.com/${h}`,
  instagram: (h) => `https://instagram.com/${h}`,
  tiktok: (h) => `https://tiktok.com/@${h}`,
};

/**
 * Like getSafePlatformProfileUrl, but when the stored URL is missing or fails
 * validation, falls back to constructing the URL from the account's username.
 * Many catalog rows (notably Twitch) have a username but no stored URL.
 */
export function getPlatformProfileUrl(
  platform: Platform,
  value: string | null | undefined,
  username?: string | null,
): string | null {
  const stored = getSafePlatformProfileUrl(platform, value);
  if (stored) return stored;

  const build = PLATFORM_USERNAME_URL[platform];
  if (!build || !username) return null;

  const handle = username.trim().replace(/^@/, "");
  // Anything beyond handle-safe characters is a display name, not a handle.
  if (!handle || !/^[\w.-]+$/.test(handle)) return null;

  return build(encodeURIComponent(handle));
}
