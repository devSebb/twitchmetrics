import { inngest } from "../../client";
import { runTierSnapshot, tierRunSummary } from "./shared";
import { executeIngestionRun } from "@/server/services/ingestion/runs";
import { TIER_SNAPSHOT_JOB_TYPE } from "@/server/services/ingestion/job-types";

// Daily at 2am UTC — Tier 2 creators (10K-100K followers).
// On Inngest only the `snapshots/tier2` event (manual admin triggers) is left.
export const tier2Snapshot = inngest.createFunction(
  { id: "tier2-snapshot", concurrency: { limit: 1 } },
  // Scheduled on GitHub (.github/workflows/creator-snapshots.yml); the event
  // is for manual runs.
  { event: "snapshots/tier2" },
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "creator",
        scope: "snapshot",
        jobType: TIER_SNAPSHOT_JOB_TYPE.tier2,
      },
      async () => {
        const result = await runTierSnapshot("tier2", step);
        return {
          result,
          summary: tierRunSummary(result, { runner: "inngest" }),
        };
      },
      step,
    );
  },
);
