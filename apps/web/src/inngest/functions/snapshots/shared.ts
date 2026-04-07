import {
  prisma,
  type SnapshotTier,
  type Platform,
} from "@twitchmetrics/database";
import { createLogger } from "@/lib/logger";
import { getAdapter } from "@/server/adapters";
import { cacheInvalidate } from "@/server/services/cache";
import { recomputeCreatorAggregates } from "@/server/services/creator-aggregates";
import { recomputeCreatorGrowthRollups } from "@/server/services/creator-growth";
import { supportsCreatorSnapshots } from "@/server/services/ingestion/constants";

const log = createLogger("snapshot-worker");

const BATCH_SIZE = 50;

function toJsonValue(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) =>
      typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
    ),
  );
}

type SnapshotableProfile = {
  id: string;
  totalFollowers: bigint;
  snapshotTier: SnapshotTier;
  platformAccounts: Array<{
    id: string;
    platform: Platform;
    platformUserId: string;
    isOAuthConnected: boolean;
    accessToken: string | null;
  }>;
};

// Inngest step tools type is complex with deep conditional types.
// Using a minimal structural type avoids tight coupling to Inngest internals.
type StepTools = {
  run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
  sleep: (name: string, duration: string) => Promise<unknown>;
};

export async function runTierSnapshot(
  tier: SnapshotTier,
  step: StepTools,
): Promise<{ processed: number; errors: number; tier: SnapshotTier }> {
  const profiles = (await step.run(`fetch-${tier}-profiles`, async () => {
    return prisma.creatorProfile.findMany({
      where: { snapshotTier: tier },
      select: {
        id: true,
        totalFollowers: true,
        snapshotTier: true,
        platformAccounts: {
          select: {
            id: true,
            platform: true,
            platformUserId: true,
            isOAuthConnected: true,
            accessToken: true,
          },
        },
      },
    });
  })) as SnapshotableProfile[];

  let processed = 0;
  let errors = 0;

  // Process in batches to respect rate limits
  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE);

    await step.run(`snapshot-batch-${tier}-${batchIndex}`, async () => {
      for (const profile of batch) {
        for (const account of profile.platformAccounts) {
          try {
            await snapshotPlatformAccount(profile.id, account);
            processed++;
          } catch (err) {
            errors++;
            log.error(
              {
                err,
                creatorProfileId: profile.id,
                platform: account.platform,
                platformUserId: account.platformUserId,
              },
              "Failed to snapshot platform account",
            );
          }
        }

        // Update aggregate totals and evaluate tier changes
        try {
          await recomputeCreatorAggregates(profile.id);
          await recomputeCreatorGrowthRollups(
            profile.id,
            profile.platformAccounts.map((account) => account.platform),
          );
        } catch (err) {
          log.error(
            { err, creatorProfileId: profile.id },
            "Failed to update profile aggregates",
          );
        }

        // Invalidate cache for this creator (non-blocking)
        try {
          const slug = await getCreatorSlug(profile.id);
          if (slug) {
            await cacheInvalidate(`creator:${slug}`);
            await cacheInvalidate(`creator:${slug}:*`);
          }
        } catch (err) {
          log.warn(
            { err, creatorProfileId: profile.id },
            "Cache invalidation failed — continuing",
          );
        }
      }
    });

    // Sleep between batches to respect rate limits (except for the last batch)
    if (i + BATCH_SIZE < profiles.length) {
      await step.sleep(`rate-limit-pause-${tier}-${batchIndex}`, "5s");
    }
  }

  // Invalidate trending/landing cache after a full tier batch
  try {
    await cacheInvalidate("trending:landing");
  } catch {
    // Non-blocking
  }

  log.info(
    { tier, total: profiles.length, processed, errors },
    "Tier snapshot completed",
  );

  return { processed, errors, tier };
}

async function snapshotPlatformAccount(
  creatorProfileId: string,
  account: {
    id: string;
    platform: Platform;
    platformUserId: string;
    isOAuthConnected: boolean;
    accessToken: string | null;
  },
): Promise<void> {
  if (!supportsCreatorSnapshots(account.platform)) {
    return;
  }

  const adapter = getAdapter(account.platform);
  if (!adapter) {
    // Platform adapter not yet implemented — skip silently
    return;
  }

  const fetchOptions: { isOAuthConnected: boolean; accessToken?: string } = {
    isOAuthConnected: account.isOAuthConnected,
  };
  if (account.accessToken) {
    fetchOptions.accessToken = account.accessToken;
  }

  const snapshotData = await adapter.fetchSnapshot(
    account.platformUserId,
    fetchOptions,
  );

  // Strip internal transport fields (prefixed with _) before persisting metrics
  const persistableMetrics = Object.fromEntries(
    Object.entries(snapshotData.extendedMetrics).filter(
      ([key]) => !key.startsWith("_"),
    ),
  );

  await prisma.metricSnapshot.create({
    data: {
      creatorProfileId,
      platform: account.platform,
      snapshotAt: snapshotData.snapshotAt,
      followerCount: snapshotData.followerCount,
      followingCount: snapshotData.followingCount,
      totalViews: snapshotData.totalViews,
      subscriberCount: snapshotData.subscriberCount,
      postCount: snapshotData.postCount,
      extendedMetrics: toJsonValue(persistableMetrics),
    },
  });

  // Update cached fields on PlatformAccount
  await prisma.platformAccount.update({
    where: { id: account.id },
    data: {
      followerCount: snapshotData.followerCount,
      followingCount: snapshotData.followingCount,
      totalViews: snapshotData.totalViews,
      subscriberCount: snapshotData.subscriberCount,
      postCount: snapshotData.postCount,
      lastSyncedAt: snapshotData.snapshotAt,
    },
  });

  // Refresh CreatorProfile bio & avatar from Twitch API data so that the
  // social-link-discovery cron picks up newly added YouTube / social links.
  // The Twitch adapter stashes these in extendedMetrics to avoid extra API calls.
  if (account.platform === "twitch") {
    const ext = snapshotData.extendedMetrics as Record<string, unknown>;
    const freshBio = typeof ext._bio === "string" ? ext._bio : null;
    const freshAvatar =
      typeof ext._avatarUrl === "string" ? ext._avatarUrl : null;

    if (freshBio !== null || freshAvatar !== null) {
      const profileUpdate: Record<string, string> = {};
      if (freshBio !== null) profileUpdate.bio = freshBio;
      if (freshAvatar !== null) profileUpdate.avatarUrl = freshAvatar;

      await prisma.creatorProfile.update({
        where: { id: creatorProfileId },
        data: profileUpdate,
      });
    }
  }
}

async function getCreatorSlug(
  creatorProfileId: string,
): Promise<string | null> {
  const profile = await prisma.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    select: { slug: true },
  });
  return profile?.slug ?? null;
}
