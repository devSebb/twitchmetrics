import {
  Prisma,
  prisma,
  type SnapshotTier,
  type Platform,
} from "@twitchmetrics/database";
import { createLogger } from "@/lib/logger";
import { getTierForCreator } from "@/lib/constants/tiers";
import { getAdapter } from "@/server/adapters";

const log = createLogger("snapshot-worker");

const BATCH_SIZE = 50;

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
          await updateProfileAggregates(profile.id);
        } catch (err) {
          log.error(
            { err, creatorProfileId: profile.id },
            "Failed to update profile aggregates",
          );
        }
      }
    });

    // Sleep between batches to respect rate limits (except for the last batch)
    if (i + BATCH_SIZE < profiles.length) {
      await step.sleep(`rate-limit-pause-${tier}-${batchIndex}`, "5s");
    }
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
      extendedMetrics: snapshotData.extendedMetrics as Prisma.InputJsonValue,
    },
  });

  // Update cached fields on PlatformAccount
  await prisma.platformAccount.update({
    where: { id: account.id },
    data: {
      followerCount: snapshotData.followerCount,
      totalViews: snapshotData.totalViews,
      lastSyncedAt: snapshotData.snapshotAt,
    },
  });
}

async function updateProfileAggregates(
  creatorProfileId: string,
): Promise<void> {
  const accounts = await prisma.platformAccount.findMany({
    where: { creatorProfileId },
    select: { followerCount: true, totalViews: true },
  });

  const totalFollowers = accounts.reduce(
    (sum, a) => sum + (a.followerCount ?? 0n),
    0n,
  );
  const totalViews = accounts.reduce(
    (sum, a) => sum + (a.totalViews ?? 0n),
    0n,
  );

  const newTier = getTierForCreator(totalFollowers);

  await prisma.creatorProfile.update({
    where: { id: creatorProfileId },
    data: {
      totalFollowers,
      totalViews,
      lastSnapshotAt: new Date(),
      snapshotTier: newTier,
    },
  });
}
