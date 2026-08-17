import {
  prisma,
  type SnapshotTier,
  type Platform,
} from "@twitchmetrics/database";
import { decryptToken } from "@/lib/encryption";
import { createLogger } from "@/lib/logger";
import { getAdapter } from "@/server/adapters";
import { cacheInvalidate } from "@/server/services/cache";
import { recomputeCreatorAggregates } from "@/server/services/creator-aggregates";
import { recomputeCreatorGrowthRollups } from "@/server/services/creator-growth";
import { supportsCreatorSnapshots } from "@/server/services/ingestion/constants";
import { refreshCreatorClips } from "@/server/services/clip-sync";

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
  // Only profile ids go through the step output: full rows (accounts + tokens)
  // for a whole tier blow Inngest's 4MB step-output cap — tier3 died this way
  // for months once the catalog passed ~30k profiles.
  const profileIds = (await step.run(`fetch-${tier}-profiles`, async () => {
    const rows = await prisma.creatorProfile.findMany({
      where: {
        snapshotTier: tier,
        mergedIntoId: null,
        // Unclaimed StreamHatchet-catalog profiles get sessions/viewers from
        // the SH S3 pipeline; polling ~1M of them here can never fit API
        // quotas or Inngest step caps. API-poll only API-born profiles plus
        // anything claimed or OAuth-connected.
        OR: [
          { catalogSource: { not: "streamhatchet" } },
          { catalogSource: null },
          { state: { in: ["claimed", "premium"] } },
          { userId: { not: null } },
          { platformAccounts: { some: { isOAuthConnected: true } } },
        ],
      },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    return rows.map((row) => row.id);
  })) as string[];

  let processed = 0;
  let errors = 0;

  for (let i = 0; i < profileIds.length; i += BATCH_SIZE) {
    const batchIds = profileIds.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE);

    // Each batch step loads its own accounts and returns its counts —
    // mutating outer counters inside step.run loses them on memoized
    // replays. No dedicated sleep steps: they doubled the step count past
    // Inngest's 1000-step cap, and a batch already takes long enough to
    // pace the platform APIs.
    const batchResult = (await step.run(
      `snapshot-batch-${tier}-${batchIndex}`,
      () => snapshotProfileBatch(batchIds),
    )) as { processed: number; errors: number };

    processed += batchResult.processed;
    errors += batchResult.errors;
  }

  // Invalidate trending/landing cache after a full tier batch
  try {
    await cacheInvalidate("trending:landing*");
  } catch {
    // Non-blocking
  }

  log.info(
    { tier, total: profileIds.length, processed, errors },
    "Tier snapshot completed",
  );

  return { processed, errors, tier };
}

async function snapshotProfileBatch(
  profileIds: string[],
): Promise<{ processed: number; errors: number }> {
  const profiles: SnapshotableProfile[] = await prisma.creatorProfile.findMany({
    where: { id: { in: profileIds } },
    select: {
      id: true,
      totalFollowers: true,
      snapshotTier: true,
      platformAccounts: {
        // Link-only accounts from the StreamHatchet social graph (IG/TikTok/X
        // handles + reach) have no adapter session and must never be polled;
        // X in particular has a public adapter that fails on every one of
        // them, which used to show up as ~2.8k "failed" per tier1 run.
        where: { discoverySource: null },
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

  let processed = 0;
  let errors = 0;

  for (const profile of profiles) {
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

  return { processed, errors };
}

export async function snapshotPlatformAccount(
  creatorProfileId: string,
  account: {
    id: string;
    platform: Platform;
    platformUserId: string;
    isOAuthConnected: boolean;
    accessToken: string | null;
  },
): Promise<void> {
  if (!supportsCreatorSnapshots(account.platform, account.isOAuthConnected)) {
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
    fetchOptions.accessToken = await decryptToken(account.accessToken);
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

  // Refresh CreatorProfile metadata from Twitch API data so that the
  // social-link-discovery cron picks up newly added YouTube / social links,
  // and so that displayName stays in sync with Twitch (handles renames).
  // The Twitch adapter stashes these in extendedMetrics to avoid extra API calls.
  if (account.platform === "twitch") {
    const ext = snapshotData.extendedMetrics as Record<string, unknown>;
    const freshBio = typeof ext._bio === "string" ? ext._bio : null;
    const freshAvatar =
      typeof ext._avatarUrl === "string" ? ext._avatarUrl : null;
    const freshDisplayName =
      typeof ext._displayName === "string" ? ext._displayName : null;
    const freshLogin = typeof ext._login === "string" ? ext._login : null;

    if (
      freshBio !== null ||
      freshAvatar !== null ||
      freshDisplayName !== null
    ) {
      const profileUpdate: Record<string, string> = {};
      if (freshBio !== null) profileUpdate.bio = freshBio;
      if (freshAvatar !== null) profileUpdate.avatarUrl = freshAvatar;
      if (freshDisplayName !== null)
        profileUpdate.displayName = freshDisplayName;

      await prisma.creatorProfile.update({
        where: { id: creatorProfileId },
        data: profileUpdate,
      });
    }

    // Keep PlatformAccount.platformUsername in sync with the Twitch login
    if (freshLogin !== null) {
      await prisma.platformAccount.update({
        where: { id: account.id },
        data: { platformUsername: freshLogin },
      });
    }

    // Refresh top clips (throttled internally to once per 20h per creator)
    try {
      await refreshCreatorClips(creatorProfileId, account.platformUserId);
    } catch (err) {
      log.warn(
        { err, creatorProfileId, platformUserId: account.platformUserId },
        "Clip sync failed — continuing",
      );
    }
  }

  if (account.platform === "tiktok") {
    const ext = snapshotData.extendedMetrics as Record<string, unknown>;
    const freshBio = typeof ext._bio === "string" ? ext._bio : null;
    const freshAvatar =
      typeof ext._avatarUrl === "string" ? ext._avatarUrl : null;
    const freshDisplayName =
      typeof ext._displayName === "string" ? ext._displayName : null;
    const freshUsername =
      typeof ext._username === "string" ? ext._username : null;
    const freshProfileUrl =
      typeof ext._profileUrl === "string" ? ext._profileUrl : null;

    if (
      freshBio !== null ||
      freshAvatar !== null ||
      freshDisplayName !== null
    ) {
      const profileUpdate: Record<string, string> = {};
      if (freshBio !== null) profileUpdate.bio = freshBio;
      if (freshAvatar !== null) profileUpdate.avatarUrl = freshAvatar;
      if (freshDisplayName !== null)
        profileUpdate.displayName = freshDisplayName;

      await prisma.creatorProfile.update({
        where: { id: creatorProfileId },
        data: profileUpdate,
      });
    }

    if (
      freshUsername !== null ||
      freshProfileUrl !== null ||
      freshAvatar !== null ||
      freshDisplayName !== null
    ) {
      await prisma.platformAccount.update({
        where: { id: account.id },
        data: {
          ...(freshUsername ? { platformUsername: freshUsername } : {}),
          ...(freshProfileUrl ? { platformUrl: freshProfileUrl } : {}),
          ...(freshAvatar ? { platformAvatarUrl: freshAvatar } : {}),
          ...(freshDisplayName
            ? { platformDisplayName: freshDisplayName }
            : {}),
        },
      });
    }
  }

  if (account.platform === "x") {
    const ext = snapshotData.extendedMetrics as Record<string, unknown>;
    const resolvedId =
      typeof ext._resolvedUserId === "string" ? ext._resolvedUserId : null;
    const freshUsername =
      typeof ext._username === "string" ? ext._username : null;
    const freshDisplayName =
      typeof ext._displayName === "string" ? ext._displayName : null;
    const freshAvatar =
      typeof ext._avatarUrl === "string" ? ext._avatarUrl : null;

    const accountUpdate: Record<string, string> = {};

    // Discovery keys X rows by @handle; heal to the immutable numeric ID so
    // renames can't orphan the row. (platform, platformUserId) is unique and
    // a link-only sh-social row may already hold the same numeric ID, so
    // only heal when the slot is free.
    if (resolvedId !== null && resolvedId !== account.platformUserId) {
      const conflict = await prisma.platformAccount.findUnique({
        where: {
          platform_platformUserId: {
            platform: "x",
            platformUserId: resolvedId,
          },
        },
        select: { id: true },
      });
      if (!conflict) {
        accountUpdate.platformUserId = resolvedId;
      } else {
        log.warn(
          {
            creatorProfileId,
            accountId: account.id,
            resolvedId,
            conflictAccountId: conflict.id,
          },
          "X numeric ID already keyed by another account — keeping handle key",
        );
      }
    }

    if (freshUsername !== null) {
      accountUpdate.platformUsername = freshUsername;
      accountUpdate.platformUrl = `https://x.com/${freshUsername}`;
    }
    if (freshDisplayName !== null) {
      accountUpdate.platformDisplayName = freshDisplayName;
    }
    if (freshAvatar !== null) {
      accountUpdate.platformAvatarUrl = freshAvatar;
    }

    if (Object.keys(accountUpdate).length > 0) {
      await prisma.platformAccount.update({
        where: { id: account.id },
        data: accountUpdate,
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
