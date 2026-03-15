/**
 * Tier-Aware Snapshot Scheduler
 *
 * Standalone script that queries creators grouped by tier, checks if each is
 * due for a new snapshot based on lastSnapshotAt, and dispatches to the
 * appropriate platform API (Twitch + YouTube).
 *
 * Processes tier1 first, then tier2, then tier3.
 *
 * Usage:
 *   tsx workers/snapshot-scheduler.ts                  # Full run
 *   tsx workers/snapshot-scheduler.ts --dry-run        # Count without writing
 *   tsx workers/snapshot-scheduler.ts --tier tier1     # Only process tier1
 *   tsx workers/snapshot-scheduler.ts --limit 50       # Process at most 50 profiles
 */

import { PrismaClient, type Prisma } from "@prisma/client";

// ============================================================
// CONFIGURATION
// ============================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 0;
})();
const TIER_FILTER = (() => {
  const idx = args.indexOf("--tier");
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
})();

const BATCH_SIZE = 50;
const PAUSE_BETWEEN_BATCHES_MS = 5000;

const prisma = new PrismaClient();

// ============================================================
// TIER INTERVALS (from src/lib/constants/tiers.ts — inlined for worker)
// ============================================================

const TIER_INTERVALS: Record<string, number> = {
  tier1: 6 * 60 * 60 * 1000, // 6 hours
  tier2: 24 * 60 * 60 * 1000, // 24 hours
  tier3: 168 * 60 * 60 * 1000, // 7 days (168 hours)
};

const TIER_ORDER = ["tier1", "tier2", "tier3"] as const;

// ============================================================
// LOGGING (lightweight — workers don't use pino)
// ============================================================

function log(
  level: "info" | "warn" | "error",
  msg: string,
  data?: Record<string, unknown>,
) {
  const ts = new Date().toISOString();
  const extra = data ? ` ${JSON.stringify(data)}` : "";
  console[level](`[${ts}] [snapshot-scheduler] ${msg}${extra}`);
}

// ============================================================
// TWITCH API (inline — workers can't use @/ imports)
// ============================================================

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET ?? "";

let twitchAppToken: string | null = null;
let twitchTokenExpiresAt = 0;
let twitchRequestCount = 0;
const TWITCH_RATE_LIMIT = 750; // Stay under 800 req/min

async function getTwitchAppToken(): Promise<string> {
  if (twitchAppToken && Date.now() < twitchTokenExpiresAt) {
    return twitchAppToken;
  }

  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set");
  }

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
  });

  if (!res.ok) {
    throw new Error(`Failed to get Twitch app token: ${res.status}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  twitchAppToken = json.access_token;
  twitchTokenExpiresAt = Date.now() + (json.expires_in - 300) * 1000; // 5-min buffer
  return twitchAppToken;
}

type TwitchUserData = {
  id: string;
  view_count: number;
};

type TwitchFollowerData = {
  total: number;
};

type TwitchStreamData = {
  data: Array<{
    viewer_count: number;
    game_name: string;
    type: string;
  }>;
};

async function fetchTwitchSnapshot(platformUserId: string): Promise<{
  followerCount: bigint;
  totalViews: bigint;
  isLive: boolean;
  viewerCount: number | null;
  gameName: string | null;
} | null> {
  if (twitchRequestCount >= TWITCH_RATE_LIMIT) {
    log("warn", "Twitch rate limit approaching — pausing", {
      requestCount: twitchRequestCount,
    });
    await new Promise((r) => setTimeout(r, 60_000));
    twitchRequestCount = 0;
  }

  const token = await getTwitchAppToken();
  const headers = {
    "Client-ID": TWITCH_CLIENT_ID,
    Authorization: `Bearer ${token}`,
  };

  // Fetch user data (view count)
  const userRes = await fetch(
    `https://api.twitch.tv/helix/users?id=${encodeURIComponent(platformUserId)}`,
    { headers },
  );
  twitchRequestCount++;

  if (!userRes.ok) {
    if (userRes.status === 429) {
      log("warn", `Twitch rate limited for user ${platformUserId}`);
      return null;
    }
    log(
      "warn",
      `Twitch API returned ${userRes.status} for user ${platformUserId}`,
    );
    return null;
  }

  const userData = (await userRes.json()) as { data: TwitchUserData[] };
  if (!userData.data || userData.data.length === 0) {
    log("warn", `Twitch user ${platformUserId} not found`);
    return null;
  }

  // Fetch follower count
  const followerRes = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${encodeURIComponent(platformUserId)}&first=1`,
    { headers },
  );
  twitchRequestCount++;

  if (!followerRes.ok) {
    log(
      "warn",
      `Twitch follower API returned ${followerRes.status} for ${platformUserId}`,
    );
    return null;
  }

  const followerData = (await followerRes.json()) as TwitchFollowerData;

  // Fetch stream data (live status)
  const streamRes = await fetch(
    `https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(platformUserId)}`,
    { headers },
  );
  twitchRequestCount++;

  if (!streamRes.ok) {
    log(
      "warn",
      `Twitch stream API returned ${streamRes.status} for ${platformUserId}`,
    );
    return null;
  }

  const streamData = (await streamRes.json()) as TwitchStreamData;
  const isLive =
    streamData.data.length > 0 && streamData.data[0]!.type === "live";

  return {
    followerCount: BigInt(followerData.total),
    totalViews: BigInt(userData.data[0]!.view_count),
    isLive,
    viewerCount: isLive ? streamData.data[0]!.viewer_count : null,
    gameName: isLive ? streamData.data[0]!.game_name : null,
  };
}

// ============================================================
// YOUTUBE API (inline — mirrors snapshot-youtube.ts pattern)
// ============================================================

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
let youtubeQuotaUsed = 0;
const YOUTUBE_QUOTA_ABORT_THRESHOLD = 9000;

type YouTubeChannelStats = {
  items?: Array<{
    id: string;
    statistics: {
      subscriberCount?: string;
      viewCount?: string;
      videoCount?: string;
      hiddenSubscriberCount: boolean;
    };
  }>;
};

async function fetchYouTubeSnapshot(channelId: string): Promise<{
  subscriberCount: bigint | null;
  totalViews: bigint | null;
  videoCount: number | null;
} | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return null; // Silently skip if no key
  }

  if (youtubeQuotaUsed > YOUTUBE_QUOTA_ABORT_THRESHOLD) {
    log("warn", "YouTube quota threshold reached — skipping", {
      quotaUsed: youtubeQuotaUsed,
    });
    return null;
  }

  const url = `${YOUTUBE_API_BASE}/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${apiKey}`;
  const res = await fetch(url);
  youtubeQuotaUsed += 3;

  if (!res.ok) {
    log("warn", `YouTube API returned ${res.status} for ${channelId}`);
    return null;
  }

  const data = (await res.json()) as YouTubeChannelStats;
  if (!data.items || data.items.length === 0) {
    log("warn", `No YouTube channel found for ID ${channelId}`);
    return null;
  }

  const stats = data.items[0]!.statistics;
  return {
    subscriberCount: stats.hiddenSubscriberCount
      ? null
      : stats.subscriberCount
        ? BigInt(stats.subscriberCount)
        : null,
    totalViews: stats.viewCount ? BigInt(stats.viewCount) : null,
    videoCount: stats.videoCount ? parseInt(stats.videoCount, 10) : null,
  };
}

// ============================================================
// SNAPSHOT DISPATCH
// ============================================================

async function snapshotAccount(
  creatorProfileId: string,
  account: {
    id: string;
    platform: string;
    platformUserId: string;
  },
): Promise<boolean> {
  if (account.platform === "twitch") {
    const data = await fetchTwitchSnapshot(account.platformUserId);
    if (!data) return false;

    await prisma.metricSnapshot.create({
      data: {
        creatorProfileId,
        platform: "twitch",
        snapshotAt: new Date(),
        followerCount: data.followerCount,
        totalViews: data.totalViews,
        extendedMetrics: {
          isLive: data.isLive,
          viewerCount: data.viewerCount,
          gameName: data.gameName,
        } satisfies Prisma.InputJsonValue,
      },
    });

    await prisma.platformAccount.update({
      where: { id: account.id },
      data: {
        followerCount: data.followerCount,
        totalViews: data.totalViews,
        lastSyncedAt: new Date(),
      },
    });

    return true;
  }

  if (account.platform === "youtube") {
    const data = await fetchYouTubeSnapshot(account.platformUserId);
    if (!data) return false;

    await prisma.metricSnapshot.create({
      data: {
        creatorProfileId,
        platform: "youtube",
        snapshotAt: new Date(),
        followerCount: data.subscriberCount,
        totalViews: data.totalViews,
        subscriberCount: data.subscriberCount,
        postCount: data.videoCount,
        extendedMetrics: {} satisfies Prisma.InputJsonValue,
      },
    });

    await prisma.platformAccount.update({
      where: { id: account.id },
      data: {
        followerCount: data.subscriberCount,
        totalViews: data.totalViews,
        lastSyncedAt: new Date(),
      },
    });

    return true;
  }

  // Unsupported platform — skip silently
  return false;
}

// ============================================================
// SCHEDULING LOGIC
// ============================================================

function isDueForSnapshot(profile: {
  snapshotTier: string;
  lastSnapshotAt: Date | null;
}): boolean {
  if (!profile.lastSnapshotAt) return true; // Never snapshotted
  const intervalMs = TIER_INTERVALS[profile.snapshotTier];
  if (!intervalMs) return true;
  return Date.now() - profile.lastSnapshotAt.getTime() >= intervalMs;
}

type SchedulableProfile = {
  id: string;
  slug: string;
  snapshotTier: string;
  lastSnapshotAt: Date | null;
  platformAccounts: Array<{
    id: string;
    platform: string;
    platformUserId: string;
  }>;
};

async function processProfiles(
  profiles: SchedulableProfile[],
): Promise<{ processed: number; skipped: number; errors: number }> {
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    log("info", `Processing batch ${batchNum}`, { size: batch.length });

    for (const profile of batch) {
      if (!isDueForSnapshot(profile)) {
        skipped++;
        continue;
      }

      for (const account of profile.platformAccounts) {
        try {
          if (DRY_RUN) {
            log("info", `[DRY RUN] Would snapshot ${profile.slug}`, {
              platform: account.platform,
              platformUserId: account.platformUserId,
              tier: profile.snapshotTier,
            });
            processed++;
            continue;
          }

          const success = await snapshotAccount(profile.id, account);
          if (success) {
            processed++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors++;
          log("error", `Failed to snapshot ${profile.slug}`, {
            platform: account.platform,
            error: (err as Error).message,
          });
        }
      }

      // Update lastSnapshotAt on the profile (unless dry run)
      if (!DRY_RUN) {
        try {
          // Re-aggregate totals from platform accounts
          const accounts = await prisma.platformAccount.findMany({
            where: { creatorProfileId: profile.id },
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

          // Evaluate tier (inlined from tiers.ts)
          let newTier: "tier1" | "tier2" | "tier3" = "tier3";
          const followerCount = Number(totalFollowers);
          if (followerCount >= 100_000) newTier = "tier1";
          else if (followerCount >= 10_000) newTier = "tier2";

          await prisma.creatorProfile.update({
            where: { id: profile.id },
            data: {
              totalFollowers,
              totalViews,
              lastSnapshotAt: new Date(),
              snapshotTier: newTier,
            },
          });
        } catch (err) {
          log("error", `Failed to update aggregates for ${profile.slug}`, {
            error: (err as Error).message,
          });
        }
      }
    }

    // Pause between batches (except last)
    if (i + BATCH_SIZE < profiles.length && !DRY_RUN) {
      log("info", `Pausing ${PAUSE_BETWEEN_BATCHES_MS}ms between batches`);
      await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_BATCHES_MS));
    }
  }

  return { processed, skipped, errors };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  log("info", "Starting snapshot scheduler", {
    dryRun: DRY_RUN,
    limit: LIMIT || "unlimited",
    tier: TIER_FILTER ?? "all tiers",
  });

  const tiersToProcess = TIER_FILTER
    ? [TIER_FILTER as (typeof TIER_ORDER)[number]]
    : [...TIER_ORDER];

  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const tier of tiersToProcess) {
    log("info", `--- Processing ${tier} ---`);

    const where: Prisma.CreatorProfileWhereInput = {
      snapshotTier: tier as "tier1" | "tier2" | "tier3",
      platformAccounts: { some: {} },
    };

    const profiles = await prisma.creatorProfile.findMany({
      where,
      select: {
        id: true,
        slug: true,
        snapshotTier: true,
        lastSnapshotAt: true,
        platformAccounts: {
          where: {
            platformUserId: { not: "" },
            platform: { in: ["twitch", "youtube"] }, // Only supported platforms
          },
          select: {
            id: true,
            platform: true,
            platformUserId: true,
          },
        },
      },
      orderBy: { totalFollowers: "desc" }, // Highest followers first
      ...(LIMIT > 0 ? { take: LIMIT } : {}),
    });

    log(
      "info",
      `Found ${profiles.length} ${tier} profiles with platform accounts`,
    );

    const dueProfiles = profiles.filter((p) => isDueForSnapshot(p));
    log(
      "info",
      `${dueProfiles.length} of ${profiles.length} are due for snapshot`,
    );

    if (dueProfiles.length === 0) {
      continue;
    }

    const results = await processProfiles(dueProfiles);
    totalProcessed += results.processed;
    totalSkipped += results.skipped;
    totalErrors += results.errors;
  }

  log(
    "info",
    `✓ ${totalProcessed} snapshots, ${totalSkipped} skipped, ${totalErrors} failed`,
    {
      twitchRequests: twitchRequestCount,
      youtubeQuotaUsed,
    },
  );
}

main()
  .catch((err) => {
    log("error", "Scheduler crashed", { error: (err as Error).message });
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
