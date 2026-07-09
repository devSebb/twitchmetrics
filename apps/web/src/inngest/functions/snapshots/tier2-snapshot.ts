import { inngest } from "../../client";
import { runTierSnapshot } from "./shared";
import { executeIngestionRun } from "@/server/services/ingestion/runs";

// Cron: daily at 2am UTC — Tier 2 creators (10K-100K followers).
// Also accepts `snapshots/tier2` event for manual admin triggers.
export const tier2Snapshot = inngest.createFunction(
  { id: "tier2-snapshot", concurrency: { limit: 1 } },
  [{ cron: "0 2 * * *" }, { event: "snapshots/tier2" }],
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "creator",
        scope: "snapshot",
        jobType: "tier2-snapshot",
      },
      async () => {
        const result = await runTierSnapshot("tier2", step);
        return {
          result,
          summary: {
            recordsScanned: result.processed + result.errors,
            recordsWritten: result.processed,
            recordsFailed: result.errors,
          },
        };
      },
      step,
    );
  },
);
