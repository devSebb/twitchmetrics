import { inngest } from "../../client";
import { createLogger } from "@/lib/logger";
import { executeIngestionRun } from "@/server/services/ingestion/runs";
import {
  discoverKickCategoryMappings,
  listKickCategoryMappingIds,
  snapshotKickCategoryMappings,
  type KickCategorySnapshotResult,
} from "@/server/services/kick-category-metrics";

const log = createLogger("kick-category-snapshot");

function missingDiscoveryCredentialsResult() {
  const result = {
    gamesConsidered: 0,
    categoriesScanned: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    rateLimited: false,
  };

  return {
    result,
    summary: {
      recordsScanned: 0,
      recordsWritten: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      metadata: { skippedReason: "KICK API credentials are not configured" },
    },
  };
}

function missingSnapshotCredentialsResult() {
  const result = {
    scanned: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    rateLimited: false,
  };

  return {
    result,
    summary: {
      recordsScanned: 0,
      recordsWritten: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      metadata: { skippedReason: "KICK API credentials are not configured" },
    },
  };
}

function hasKickCredentials() {
  return Boolean(process.env.KICK_CLIENT_ID && process.env.KICK_CLIENT_SECRET);
}

export const kickCategoryDiscovery = inngest.createFunction(
  { id: "kick-category-discovery", concurrency: { limit: 1 } },
  [{ cron: "10 */6 * * *" }, { event: "snapshots/kick-category-discovery" }],
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "game",
        scope: "discovery",
        jobType: "kick-category-discovery",
        platform: "kick",
      },
      async () => {
        if (!hasKickCredentials()) {
          log.warn("Skipping KICK category discovery; missing credentials");
          return missingDiscoveryCredentialsResult();
        }

        const result = await discoverKickCategoryMappings();
        log.info(result, "KICK category discovery completed");

        return {
          result,
          summary: {
            recordsScanned: result.categoriesScanned,
            recordsWritten: result.written,
            recordsSkipped: result.skipped,
            recordsFailed: result.failed,
            partialCount: result.rateLimited ? 1 : 0,
            metadata: {
              gamesConsidered: result.gamesConsidered,
              rateLimited: result.rateLimited,
            },
          },
        };
      },
      step,
    );
  },
);

// Mappings snapshotted per step.run call. ~2s of throttled Kick API work per
// mapping means ~100 fit a 300s serverless invocation; the full sweep (~391)
// hard-killed the function every hour and each Inngest retry orphaned a fresh
// "running" IngestionRun row.
const SNAPSHOT_CHUNK_SIZE = 100;

export const kickCategorySnapshot = inngest.createFunction(
  { id: "kick-category-snapshot", concurrency: { limit: 1 } },
  [{ cron: "20 */1 * * *" }, { event: "snapshots/kick-categories" }],
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "game",
        scope: "snapshot",
        jobType: "kick-category-snapshot",
        platform: "kick",
      },
      async () => {
        if (!hasKickCredentials()) {
          log.warn("Skipping KICK category snapshot; missing credentials");
          return missingSnapshotCredentialsResult();
        }

        const sweep = (await step.run("list-kick-mappings", async () => ({
          ids: await listKickCategoryMappingIds(),
          // One shared timestamp so every chunk lands in the same 30-min
          // snapshot bucket.
          snapshotAt: new Date().toISOString(),
        }))) as { ids: string[]; snapshotAt: string };

        const result: KickCategorySnapshotResult = {
          scanned: 0,
          written: 0,
          snapshotted: 0,
          skipped: 0,
          failed: 0,
          rateLimited: false,
          touchedGames: [],
        };

        const touchedGameIds = new Set<string>();
        for (
          let i = 0;
          i < sweep.ids.length && !result.rateLimited;
          i += SNAPSHOT_CHUNK_SIZE
        ) {
          const chunkIds = sweep.ids.slice(i, i + SNAPSHOT_CHUNK_SIZE);
          const chunkIndex = Math.floor(i / SNAPSHOT_CHUNK_SIZE);
          const chunk = (await step.run(
            `snapshot-kick-categories-${chunkIndex}`,
            () =>
              snapshotKickCategoryMappings({
                ids: chunkIds,
                snapshotAt: new Date(sweep.snapshotAt),
              }),
          )) as KickCategorySnapshotResult;

          result.scanned += chunk.scanned;
          result.written += chunk.written;
          result.snapshotted += chunk.snapshotted;
          result.skipped += chunk.skipped;
          result.failed += chunk.failed;
          result.rateLimited = result.rateLimited || chunk.rateLimited;
          for (const game of chunk.touchedGames) {
            if (touchedGameIds.has(game.id)) continue;
            touchedGameIds.add(game.id);
            result.touchedGames.push(game);
          }
        }

        log.info(result, "KICK category snapshot completed");

        return {
          result,
          summary: {
            recordsScanned: result.scanned,
            recordsWritten: result.written,
            recordsSkipped: result.skipped,
            recordsFailed: result.failed,
            partialCount: result.rateLimited ? 1 : 0,
            metadata: {
              snapshotted: result.snapshotted,
              rateLimited: result.rateLimited,
              touchedGames: result.touchedGames.map((game) => game.slug),
            },
          },
        };
      },
      step,
    );
  },
);
