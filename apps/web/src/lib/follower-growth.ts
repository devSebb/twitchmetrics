import type { Platform } from "@twitchmetrics/database";

/**
 * Platforms the Follower Growth widget can chart, primary platform first —
 * the first entry is the tab it opens on. Link-only social accounts
 * (discoverySource set, e.g. StreamHatchet-discovered IG/TikTok/X) have no
 * snapshot history, so they are left out.
 *
 * Shared by the widget and the server-side availability check so the layout
 * reserves a slot only when the default tab will actually have data.
 */
export function getGrowthPlatforms(
  accounts: { platform: Platform; discoverySource?: string | null }[],
  primaryPlatform: Platform,
): Platform[] {
  const tracked = accounts
    .filter((a) => a.discoverySource == null)
    .map((a) => a.platform);
  return tracked.includes(primaryPlatform)
    ? [primaryPlatform, ...tracked.filter((p) => p !== primaryPlatform)]
    : tracked;
}
