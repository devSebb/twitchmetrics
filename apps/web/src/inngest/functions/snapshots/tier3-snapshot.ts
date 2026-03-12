import { inngest } from "../../client";
import { runTierSnapshot } from "./shared";

// Cron: weekly, Sunday 3am UTC — Tier 3 creators (under 10K followers)
export const tier3Snapshot = inngest.createFunction(
  { id: "tier3-snapshot", concurrency: { limit: 1 } },
  { cron: "0 3 * * 0" },
  async ({ step }) => {
    return runTierSnapshot("tier3", step);
  },
);
