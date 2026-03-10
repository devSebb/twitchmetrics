import { inngest } from "../../client"

// Cron: daily at 2am UTC — Top 100K creators
// TODO: Same as tier1 but for SnapshotTier.tier2 profiles
export const tier2Snapshot = inngest.createFunction(
  { id: "tier2-snapshot" },
  { cron: "0 2 * * *" },
  async ({ step }) => {
    // TODO: implement
  },
)
