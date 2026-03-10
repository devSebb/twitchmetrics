import { inngest } from "../../client"

// Cron: weekly, Sunday 3am UTC — All other creators
// TODO: Same as tier1 but for SnapshotTier.tier3 profiles
export const tier3Snapshot = inngest.createFunction(
  { id: "tier3-snapshot" },
  { cron: "0 3 * * 0" },
  async ({ step }) => {
    // TODO: implement
  },
)
