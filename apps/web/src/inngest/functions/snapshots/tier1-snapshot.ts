import { inngest } from "../../client";
import { runTierSnapshot } from "./shared";
import { executeIngestionRun } from "@/server/services/ingestion/runs";

// Cron: every 6 hours — Tier 1 creators (100K+ followers)
export const tier1Snapshot = inngest.createFunction(
  { id: "tier1-snapshot", concurrency: { limit: 1 } },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "creator",
        scope: "snapshot",
        jobType: "tier1-snapshot",
      },
      async () => {
        const result = await runTierSnapshot("tier1", step);
        return {
          result,
          summary: {
            recordsScanned: result.processed + result.errors,
            recordsWritten: result.processed,
            recordsFailed: result.errors,
          },
        };
      },
    );
  },
);
