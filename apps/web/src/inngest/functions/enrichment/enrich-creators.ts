import { inngest } from "../../client";
import { enrichCreatorBatch } from "@/server/services/creator-enrichment";
import { executeIngestionRun } from "@/server/services/ingestion/runs";
import { createLogger } from "@/lib/logger";

const log = createLogger("enrich-creators");

const BATCH_SIZE = 500;

/**
 * Daily creator enrichment — derives primary game, language, and 30-day
 * activity from MetricSnapshot history. Powers language/game filters.
 *
 * Runs at 4 AM UTC, after tier2 (2 AM) and tier3 (3 AM) so freshly-written
 * snapshots are included in the derivation window.
 */
export const enrichCreators = inngest.createFunction(
  { id: "enrich-creators", concurrency: { limit: 1 } },
  [{ cron: "0 4 * * *" }, { event: "creators/enrich" }],
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "creator",
        scope: "enrichment",
        jobType: "enrich-creators",
      },
      async () => {
        const result = await step.run("enrich-batch", async () => {
          return enrichCreatorBatch(BATCH_SIZE);
        });

        log.info(result, "Creator enrichment complete");
        return {
          result,
          summary: {
            recordsScanned: result.processed,
            recordsWritten: result.updated,
          },
        };
      },
    );
  },
);
