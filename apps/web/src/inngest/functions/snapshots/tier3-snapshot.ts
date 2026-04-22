import { inngest } from "../../client";
import { runTierSnapshot } from "./shared";
import { executeIngestionRun } from "@/server/services/ingestion/runs";

// Cron: daily at 3am UTC — Tier 3 creators (under 10K followers).
// Was weekly, which left small creators with barely any data points;
// daily snapshots give growth rollups enough signal to work.
// Also accepts `snapshots/tier3` event for manual admin triggers.
export const tier3Snapshot = inngest.createFunction(
  { id: "tier3-snapshot", concurrency: { limit: 1 } },
  [{ cron: "0 3 * * *" }, { event: "snapshots/tier3" }],
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "creator",
        scope: "snapshot",
        jobType: "tier3-snapshot",
      },
      async () => {
        const result = await runTierSnapshot("tier3", step);
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
