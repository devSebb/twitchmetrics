import { Worker, type ConnectionOptions } from "bullmq";
import { prisma } from "@twitchmetrics/database";
import { createLogger } from "@/lib/logger";
import { getAdapter } from "@/server/adapters";
import type {
  SnapshotJobData,
  GrowthRollupJobData,
  SearchReindexJobData,
} from "./index";
import type { Prisma } from "@twitchmetrics/database";

const log = createLogger("queue-worker");

// ============================================================
// CONNECTION (mirrors index.ts)
// ============================================================

function getConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || "6379", 10),
      password: parsed.password || undefined,
      username: parsed.username || undefined,
    };
  }

  return { host: "localhost", port: 6379 };
}

const connection = getConnection();

// ============================================================
// SNAPSHOT WORKER
// ============================================================

async function processSnapshotJob(data: SnapshotJobData): Promise<void> {
  const platform = data.type === "SNAPSHOT_TWITCH" ? "twitch" : "youtube";
  const adapter = getAdapter(platform as "twitch" | "youtube");

  if (!adapter) {
    log.warn({ platform }, "No adapter available — skipping snapshot job");
    return;
  }

  // Look up the platform account for OAuth context
  const account = await prisma.platformAccount.findUnique({
    where: { id: data.platformAccountId },
    select: { isOAuthConnected: true, accessToken: true },
  });

  if (!account) {
    log.warn(
      { platformAccountId: data.platformAccountId },
      "Platform account not found — skipping",
    );
    return;
  }

  const fetchOptions: { isOAuthConnected: boolean; accessToken?: string } = {
    isOAuthConnected: account.isOAuthConnected,
  };
  if (account.accessToken) {
    fetchOptions.accessToken = account.accessToken;
  }

  const snapshotData = await adapter.fetchSnapshot(
    data.platformUserId,
    fetchOptions,
  );

  await prisma.metricSnapshot.create({
    data: {
      creatorProfileId: data.creatorProfileId,
      platform: platform as "twitch" | "youtube",
      snapshotAt: snapshotData.snapshotAt,
      followerCount: snapshotData.followerCount,
      followingCount: snapshotData.followingCount,
      totalViews: snapshotData.totalViews,
      subscriberCount: snapshotData.subscriberCount,
      postCount: snapshotData.postCount,
      extendedMetrics: snapshotData.extendedMetrics as Prisma.InputJsonValue,
    },
  });

  await prisma.platformAccount.update({
    where: { id: data.platformAccountId },
    data: {
      followerCount: snapshotData.followerCount,
      totalViews: snapshotData.totalViews,
      lastSyncedAt: snapshotData.snapshotAt,
    },
  });

  log.info(
    {
      creatorProfileId: data.creatorProfileId,
      platform,
      platformUserId: data.platformUserId,
    },
    "Snapshot job completed",
  );
}

// ============================================================
// GROWTH ROLLUP WORKER
// ============================================================

async function processGrowthRollupJob(
  data: GrowthRollupJobData,
): Promise<void> {
  log.info(
    { creatorProfileId: data.creatorProfileId },
    "Growth rollup job received — delegating to rollup worker",
  );
  // Growth rollup logic is in the standalone workers/growth-rollup.ts
  // This queue processor dispatches the computation for a single creator.
  // Full implementation deferred to STAGE5-04 (Task 5.4.1).
}

// ============================================================
// SEARCH REINDEX WORKER
// ============================================================

async function processSearchReindexJob(
  data: SearchReindexJobData,
): Promise<void> {
  log.info(
    { scope: data.scope },
    "Search reindex job received — delegating to reindex worker",
  );
  // Full implementation deferred to STAGE5-04 (Task 5.4.3).
}

// ============================================================
// WORKER INSTANCES
// ============================================================

const CONCURRENCY = 5;

/**
 * Start all queue workers. Call this from a dedicated worker process.
 * Do NOT call this from the Next.js server — workers should run separately.
 */
export function startWorkers(): {
  snapshotWorker: Worker;
  growthWorker: Worker;
  searchWorker: Worker;
} {
  const snapshotWorker = new Worker<SnapshotJobData>(
    "snapshots",
    async (job) => {
      await processSnapshotJob(job.data);
    },
    { connection, concurrency: CONCURRENCY },
  );

  const growthWorker = new Worker<GrowthRollupJobData>(
    "growth-rollups",
    async (job) => {
      await processGrowthRollupJob(job.data);
    },
    { connection, concurrency: CONCURRENCY },
  );

  const searchWorker = new Worker<SearchReindexJobData>(
    "search-reindex",
    async (job) => {
      await processSearchReindexJob(job.data);
    },
    { connection, concurrency: 1 }, // Search reindex is heavy — single concurrency
  );

  // Shared error handling
  for (const worker of [snapshotWorker, growthWorker, searchWorker]) {
    worker.on("failed", (job, err) => {
      log.error(
        {
          jobId: job?.id,
          jobName: job?.name,
          attempt: job?.attemptsMade,
          error: err.message,
        },
        "Job failed",
      );
    });

    worker.on("completed", (job) => {
      log.debug({ jobId: job.id, jobName: job.name }, "Job completed");
    });
  }

  log.info("All queue workers started");

  return { snapshotWorker, growthWorker, searchWorker };
}
