import { inngest } from "../../client";
import { createLogger } from "@/lib/logger";
import { executeIngestionRun } from "@/server/services/ingestion/runs";
import {
  discoverKickCategoryMappings,
  snapshotKickCategoryMappings,
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
  async () => {
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
    );
  },
);

export const kickCategorySnapshot = inngest.createFunction(
  { id: "kick-category-snapshot", concurrency: { limit: 1 } },
  [{ cron: "20 */1 * * *" }, { event: "snapshots/kick-categories" }],
  async () => {
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

        const result = await snapshotKickCategoryMappings();
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
    );
  },
);
