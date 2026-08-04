import type { Platform, SnapshotTier } from "@twitchmetrics/database";

export type CreatorPlatformCapability = {
  supportsPublicProfile: boolean;
  supportsPublicSnapshot: boolean;
  supportsOAuthSnapshot: boolean;
  supportsOAuthEnrichment: boolean;
  supportsTokenRefresh: boolean;
  requiresOAuthForBaseline: boolean;
  quotaSensitive: boolean;
};

export const CREATOR_PLATFORM_CAPABILITIES: Record<
  Platform,
  CreatorPlatformCapability
> = {
  twitch: {
    supportsPublicProfile: true,
    supportsPublicSnapshot: true,
    supportsOAuthSnapshot: false,
    supportsOAuthEnrichment: true,
    supportsTokenRefresh: true,
    requiresOAuthForBaseline: false,
    quotaSensitive: false,
  },
  youtube: {
    supportsPublicProfile: true,
    supportsPublicSnapshot: true,
    supportsOAuthSnapshot: false,
    supportsOAuthEnrichment: true,
    supportsTokenRefresh: true,
    requiresOAuthForBaseline: false,
    quotaSensitive: true,
  },
  instagram: {
    supportsPublicProfile: true,
    supportsPublicSnapshot: false,
    supportsOAuthSnapshot: false,
    supportsOAuthEnrichment: true,
    supportsTokenRefresh: true,
    requiresOAuthForBaseline: true,
    quotaSensitive: false,
  },
  tiktok: {
    supportsPublicProfile: true,
    supportsPublicSnapshot: false,
    supportsOAuthSnapshot: true,
    supportsOAuthEnrichment: true,
    supportsTokenRefresh: true,
    requiresOAuthForBaseline: true,
    quotaSensitive: false,
  },
  x: {
    supportsPublicProfile: true,
    // Public reads go through the app-level TWITTER_BEARER_TOKEN — no
    // per-user OAuth needed, but the X API Basic tier caps reads, so only
    // the ~dozens of real (non-link-only) X accounts may flow through here.
    supportsPublicSnapshot: true,
    supportsOAuthSnapshot: false,
    supportsOAuthEnrichment: false,
    supportsTokenRefresh: true,
    requiresOAuthForBaseline: false,
    quotaSensitive: true,
  },
  kick: {
    supportsPublicProfile: false,
    supportsPublicSnapshot: false,
    supportsOAuthSnapshot: false,
    supportsOAuthEnrichment: false,
    supportsTokenRefresh: false,
    requiresOAuthForBaseline: true,
    quotaSensitive: false,
  },
};

export const CREATOR_SNAPSHOT_INTERVAL_MS: Record<SnapshotTier, number> = {
  tier1: 6 * 60 * 60 * 1000,
  tier2: 24 * 60 * 60 * 1000,
  tier3: 7 * 24 * 60 * 60 * 1000,
};

export const GAME_SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000;
export const GAME_SNAPSHOT_STALE_MS = 2 * 60 * 60 * 1000;

export function supportsCreatorSnapshots(
  platform: Platform,
  isOAuthConnected = false,
): boolean {
  const capability = CREATOR_PLATFORM_CAPABILITIES[platform];
  return (
    capability.supportsPublicSnapshot ||
    (capability.supportsOAuthSnapshot && isOAuthConnected)
  );
}

export function supportsCreatorEnrichment(platform: Platform): boolean {
  return CREATOR_PLATFORM_CAPABILITIES[platform].supportsOAuthEnrichment;
}
