import { inngest } from "../../client";
import { runTierSnapshot } from "./shared";

// Cron: daily at 2am UTC — Tier 2 creators (10K-100K followers)
export const tier2Snapshot = inngest.createFunction(
  { id: "tier2-snapshot", concurrency: { limit: 1 } },
  { cron: "0 2 * * *" },
  async ({ step }) => {
    return runTierSnapshot("tier2", step);
  },
);
