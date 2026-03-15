import { Queue, type ConnectionOptions } from "bullmq";
import type { SnapshotTier } from "@twitchmetrics/database";

// ============================================================
// CONNECTION
// ============================================================

/**
 * BullMQ requires a standard Redis connection (TCP), NOT Upstash HTTP REST.
 * Set REDIS_URL to a standard Redis instance (e.g., from docker-compose or managed Redis).
 * Falls back to localhost:6379 for local development.
 */
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
// JOB TYPES
// ============================================================

export type SnapshotJobData = {
  type: "SNAPSHOT_TWITCH" | "SNAPSHOT_YOUTUBE";
  creatorProfileId: string;
  platformAccountId: string;
  platformUserId: string;
  tier: SnapshotTier;
};

export type GrowthRollupJobData = {
  type: "GROWTH_ROLLUP";
  creatorProfileId: string;
};

export type SearchReindexJobData = {
  type: "SEARCH_REINDEX";
  scope: "creators" | "games" | "all";
};

export type JobData =
  | SnapshotJobData
  | GrowthRollupJobData
  | SearchReindexJobData;

// ============================================================
// QUEUES
// ============================================================

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2000, // 2s → 4s → 8s
  },
  removeOnComplete: { count: 1000 }, // Keep last 1000 completed jobs
  removeOnFail: { count: 5000 }, // Keep last 5000 failed jobs for debugging
};

export const snapshotQueue = new Queue<SnapshotJobData>("snapshots", {
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const growthQueue = new Queue<GrowthRollupJobData>("growth-rollups", {
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const searchQueue = new Queue<SearchReindexJobData>("search-reindex", {
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

// ============================================================
// QUEUE HELPERS
// ============================================================

/**
 * Enqueue a snapshot job for a specific platform account.
 */
export async function enqueueSnapshot(data: SnapshotJobData): Promise<void> {
  await snapshotQueue.add(`${data.type}:${data.platformUserId}`, data, {
    // Deduplicate: don't queue another job for the same account if one is pending
    jobId: `snapshot:${data.platformAccountId}`,
  });
}

/**
 * Enqueue a growth rollup computation for a creator.
 */
export async function enqueueGrowthRollup(
  creatorProfileId: string,
): Promise<void> {
  await growthQueue.add(
    `rollup:${creatorProfileId}`,
    { type: "GROWTH_ROLLUP", creatorProfileId },
    {
      jobId: `rollup:${creatorProfileId}`,
    },
  );
}

/**
 * Enqueue a search reindex job.
 */
export async function enqueueSearchReindex(
  scope: "creators" | "games" | "all" = "all",
): Promise<void> {
  await searchQueue.add(
    `reindex:${scope}`,
    { type: "SEARCH_REINDEX", scope },
    {
      jobId: `reindex:${scope}`,
    },
  );
}
