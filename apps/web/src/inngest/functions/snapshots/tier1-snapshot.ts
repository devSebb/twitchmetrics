import { inngest } from "../../client";
import { runTierSnapshot } from "./shared";

// Cron: every 6 hours — Tier 1 creators (100K+ followers)
export const tier1Snapshot = inngest.createFunction(
  { id: "tier1-snapshot", concurrency: { limit: 1 } },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    return runTierSnapshot("tier1", step);
  },
);
