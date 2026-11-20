import { inngest } from "../../client";
import { runTierSnapshot, tierRunSummary } from "./shared";
import { executeIngestionRun } from "@/server/services/ingestion/runs";
import { TIER_SNAPSHOT_JOB_TYPE } from "@/server/services/ingestion/job-types";

// Daily at 3am UTC — Tier 3 creators (under 10K followers).
// Was weekly, which left small creators with barely any data points;
// daily snapshots give growth rollups enough signal to work.
// On Inngest only the `snapshots/tier3` event (manual admin triggers) is left.
export const tier3Snapshot = inngest.createFunction(
  { id: "tier3-snapshot", concurrency: { limit: 1 } },
  // Scheduled on GitHub (.github/workflows/creator-snapshots.yml); the event
  // is for manual runs.
  { event: "snapshots/tier3" },
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "creator",
        scope: "snapshot",
        jobType: TIER_SNAPSHOT_JOB_TYPE.tier3,
      },
      async () => {
        const result = await runTierSnapshot("tier3", step);
        return {
          result,
          summary: tierRunSummary(result, { runner: "inngest" }),
        };
      },
      step,
    );
  },
);
