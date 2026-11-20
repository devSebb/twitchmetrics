import { inngest } from "../../client";
import { runTierSnapshot, tierRunSummary } from "./shared";
import { executeIngestionRun } from "@/server/services/ingestion/runs";
import { TIER_SNAPSHOT_JOB_TYPE } from "@/server/services/ingestion/job-types";

// Every 6 hours — Tier 1 creators (100K+ followers).
// On Inngest only the `snapshots/tier1` event (manual admin triggers) is left.
export const tier1Snapshot = inngest.createFunction(
  { id: "tier1-snapshot", concurrency: { limit: 1 } },
  // Scheduled on GitHub (.github/workflows/creator-snapshots.yml); the event
  // is for manual runs.
  { event: "snapshots/tier1" },
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "creator",
        scope: "snapshot",
        jobType: TIER_SNAPSHOT_JOB_TYPE.tier1,
      },
      async () => {
        const result = await runTierSnapshot("tier1", step);
        return {
          result,
          summary: tierRunSummary(result, { runner: "inngest" }),
        };
      },
      step,
    );
  },
);
