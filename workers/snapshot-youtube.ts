/**
 * YouTube Snapshot Worker
 *
 * Standalone script for manual or cron-triggered YouTube snapshots.
 * Processes YouTube PlatformAccounts in batches with quota awareness.
 *
 * Usage:
 *   tsx workers/snapshot-youtube.ts                  # Full run
 *   tsx workers/snapshot-youtube.ts --dry-run        # Count without writing
 *   tsx workers/snapshot-youtube.ts --limit 50       # Process at most 50 accounts
 *   tsx workers/snapshot-youtube.ts --tier tier1     # Only snapshot tier1 profiles
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
const QUOTA_ABORT_THRESHOLD = 9000;

const prisma = new PrismaClient();

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
  console[level](`[${ts}] [youtube-snapshot] ${msg}${extra}`);
}

// ============================================================
// YOUTUBE API (minimal inline — avoids path alias issues in workers)
// ============================================================

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

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

let quotaUsed = 0;

async function fetchYouTubeStats(channelId: string): Promise<{
  subscriberCount: bigint | null;
  totalViews: bigint | null;
  videoCount: number | null;
} | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    log("error", "YOUTUBE_API_KEY not set");
    return null;
  }

  const url = `${YOUTUBE_API_BASE}/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${apiKey}`;
  const res = await fetch(url);

  quotaUsed += 3; // channels.list costs ~3 units

  if (!res.ok) {
    log("warn", `YouTube API returned ${res.status} for ${channelId}`);
    return null;
  }

  const data = (await res.json()) as YouTubeChannelStats;
  if (!data.items || data.items.length === 0) {
    log("warn", `No channel found for ID ${channelId}`);
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
// MAIN
// ============================================================

async function main() {
  log("info", "Starting YouTube snapshot worker", {
    dryRun: DRY_RUN,
    limit: LIMIT || "unlimited",
    tier: TIER_FILTER ?? "all",
  });

  // Query YouTube platform accounts
  const where: Prisma.PlatformAccountWhereInput = {
    platform: "youtube",
    platformUserId: { not: "" },
  };

  if (TIER_FILTER) {
    where.creatorProfile = {
      snapshotTier: TIER_FILTER as "tier1" | "tier2" | "tier3",
    };
  }

  const accounts = await prisma.platformAccount.findMany({
    where,
    select: {
      id: true,
      platformUserId: true,
      creatorProfileId: true,
    },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
  });

  log("info", `Found ${accounts.length} YouTube accounts to process`);

  if (DRY_RUN) {
    log("info", "Dry run complete — no snapshots written");
    return;
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    // Quota check before each batch
    if (quotaUsed > QUOTA_ABORT_THRESHOLD) {
      log("warn", "Aborting — quota threshold reached", { quotaUsed });
      break;
    }

    const batch = accounts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    log("info", `Processing batch ${batchNum}`, {
      size: batch.length,
      quotaUsed,
    });

    for (const account of batch) {
      try {
        const stats = await fetchYouTubeStats(account.platformUserId);
        if (!stats) {
          skipped++;
          continue;
        }

        // Write MetricSnapshot
        await prisma.metricSnapshot.create({
          data: {
            creatorProfileId: account.creatorProfileId,
            platform: "youtube",
            snapshotAt: new Date(),
            followerCount: stats.subscriberCount,
            totalViews: stats.totalViews,
            subscriberCount: stats.subscriberCount,
            postCount: stats.videoCount,
            extendedMetrics: {} satisfies Prisma.InputJsonValue,
          },
        });

        // Update cached fields on PlatformAccount
        await prisma.platformAccount.update({
          where: { id: account.id },
          data: {
            followerCount: stats.subscriberCount,
            totalViews: stats.totalViews,
            lastSyncedAt: new Date(),
          },
        });

        processed++;
      } catch (err) {
        failed++;
        log("error", `Failed for ${account.platformUserId}`, {
          error: (err as Error).message,
        });
      }
    }

    // Pause between batches (except last)
    if (i + BATCH_SIZE < accounts.length) {
      log("info", `Pausing ${PAUSE_BETWEEN_BATCHES_MS}ms between batches`);
      await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_BATCHES_MS));
    }
  }

  log("info", "YouTube snapshot worker complete", {
    processed,
    skipped,
    failed,
    quotaUsed,
    total: accounts.length,
  });
}

main()
  .catch((err) => {
    log("error", "Worker crashed", { error: (err as Error).message });
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
