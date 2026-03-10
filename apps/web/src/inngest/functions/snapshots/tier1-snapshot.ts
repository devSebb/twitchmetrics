import { inngest } from "../../client"

// Cron: every 6 hours — Top 10K creators
// TODO: Fetch metrics for all SnapshotTier.tier1 profiles
// Platforms to snapshot: Twitch (Helix API - streams, followers, clips),
//   YouTube (Data API v3 - channel stats, video stats),
//   Instagram (Graph API - if OAuth connected),
//   TikTok (if OAuth connected), X (API v2), Kick
// Write MetricSnapshot rows + update PlatformAccount cached fields
// Update CreatorProfile.totalFollowers and totalViews aggregates
// Respect per-platform rate limits via Upstash rate limiter
export const tier1Snapshot = inngest.createFunction(
  { id: "tier1-snapshot" },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    // TODO: implement
  },
)
