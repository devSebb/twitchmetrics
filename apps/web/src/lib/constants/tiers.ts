import type { SnapshotTier } from "@twitchmetrics/database";

export type TierConfig = {
  tier: SnapshotTier;
  label: string;
  description: string;
  followerThreshold: number;
  cronExpression: string;
  intervalHours: number;
  promotionThreshold: number;
  demotionThreshold: number;
  demotionGracePeriod: number;
};

export const TIER_CONFIG: Record<SnapshotTier, TierConfig> = {
  tier1: {
    tier: "tier1",
    label: "Tier 1",
    description: "Top creators with 100K+ followers, snapshotted every 6 hours",
    followerThreshold: 100_000,
    cronExpression: "0 */6 * * *",
    intervalHours: 6,
    promotionThreshold: Infinity,
    demotionThreshold: 75_000,
    demotionGracePeriod: 3,
  },
  tier2: {
    tier: "tier2",
    label: "Tier 2",
    description: "Mid-size creators with 10K+ followers, snapshotted daily",
    followerThreshold: 10_000,
    cronExpression: "0 2 * * *",
    intervalHours: 24,
    promotionThreshold: 100_000,
    demotionThreshold: 7_500,
    demotionGracePeriod: 3,
  },
  tier3: {
    tier: "tier3",
    label: "Tier 3",
    description: "All other creators, snapshotted weekly",
    followerThreshold: 0,
    cronExpression: "0 3 * * 0",
    intervalHours: 168,
    promotionThreshold: 10_000,
    demotionThreshold: 0,
    demotionGracePeriod: 0,
  },
};

export function getTierForCreator(
  totalFollowers: number | bigint,
): SnapshotTier {
  const count = Number(totalFollowers);
  if (count >= TIER_CONFIG.tier1.followerThreshold) return "tier1";
  if (count >= TIER_CONFIG.tier2.followerThreshold) return "tier2";
  return "tier3";
}

export function getSnapshotIntervalMs(tier: SnapshotTier): number {
  return TIER_CONFIG[tier].intervalHours * 60 * 60 * 1000;
}

export function getTierCron(tier: SnapshotTier): string {
  return TIER_CONFIG[tier].cronExpression;
}

export function evaluatePromotion(
  currentTier: SnapshotTier,
  totalFollowers: number | bigint,
): SnapshotTier {
  const count = Number(totalFollowers);
  const config = TIER_CONFIG[currentTier];

  if (count >= config.promotionThreshold) {
    if (currentTier === "tier2") return "tier1";
    if (currentTier === "tier3") return "tier2";
  }

  return currentTier;
}

export function evaluateDemotion(
  currentTier: SnapshotTier,
  totalFollowers: number | bigint,
  consecutiveBelowCount: number,
): SnapshotTier {
  const count = Number(totalFollowers);
  const config = TIER_CONFIG[currentTier];

  if (
    config.demotionThreshold > 0 &&
    count < config.demotionThreshold &&
    consecutiveBelowCount >= config.demotionGracePeriod
  ) {
    if (currentTier === "tier1") return "tier2";
    if (currentTier === "tier2") return "tier3";
  }

  return currentTier;
}
