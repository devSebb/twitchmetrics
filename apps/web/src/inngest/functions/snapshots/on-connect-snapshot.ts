import { prisma, type Platform } from "@twitchmetrics/database";
import { inngest } from "@/inngest/client";
import { createLogger } from "@/lib/logger";
import { cacheInvalidate } from "@/server/services/cache";
import { recomputeCreatorAggregates } from "@/server/services/creator-aggregates";
import { recomputeCreatorGrowthRollups } from "@/server/services/creator-growth";
import { snapshotPlatformAccount } from "./shared";

const log = createLogger("on-connect-snapshot");

/**
 * Fires immediately when a creator connects (or reconnects) a platform account.
 * Triggered by the `creator/platform.connected` event sent from connectPlatform().
 *
 * Runs a single-creator snapshot so the dashboard is populated with real data
 * within seconds — no need to wait for the next scheduled tier cron.
 *
 * Also promotes the CreatorProfile slug from the placeholder `user-{uuid}` to
 * the creator's actual Twitch login, and keeps displayName in sync.
 */
export const onConnectSnapshot = inngest.createFunction(
  { id: "snapshot-on-connect", retries: 2 },
  { event: "creator/platform.connected" },
  async ({ event, step }) => {
    const { creatorProfileId, platform, platformAccountId } = event.data as {
      creatorProfileId: string;
      platform: Platform;
      platformUserId: string;
      platformAccountId: string;
    };

    log.info({ creatorProfileId, platform }, "on-connect snapshot started");

    // 1. Run the snapshot for this platform account.
    //    snapshotPlatformAccount writes MetricSnapshot, updates PlatformAccount
    //    cached fields, and (for Twitch) syncs bio/avatar/displayName/platformUsername
    //    onto the CreatorProfile.
    await step.run("snapshot", async () => {
      const account = await prisma.platformAccount.findUnique({
        where: { id: platformAccountId },
        select: {
          id: true,
          platform: true,
          platformUserId: true,
          isOAuthConnected: true,
          accessToken: true,
        },
      });

      if (!account) {
        log.warn(
          { platformAccountId },
          "Platform account not found — skipping snapshot",
        );
        return;
      }

      await snapshotPlatformAccount(creatorProfileId, account);
    });

    // 2. Recompute aggregate totals (totalFollowers, totalViews) and update snapshotTier.
    await step.run("recompute-aggregates", async () => {
      await recomputeCreatorAggregates(creatorProfileId);
    });

    // 3. Recompute growth rollups (delta1d/7d/30d, pct, trendDirection, acceleration).
    await step.run("recompute-rollups", async () => {
      await recomputeCreatorGrowthRollups(creatorProfileId, [platform]);
    });

    // 4. Promote slug: if it's still the placeholder "user-{uuid}", replace it with
    //    the Twitch login that was just synced into platformUsername by step 1.
    if (platform === "twitch") {
      await step.run("promote-slug", async () => {
        const profile = await prisma.creatorProfile.findUnique({
          where: { id: creatorProfileId },
          select: { slug: true },
        });

        if (!profile?.slug.startsWith("user-")) {
          // Already has a real slug — nothing to do.
          return;
        }

        const account = await prisma.platformAccount.findUnique({
          where: { id: platformAccountId },
          select: { platformUsername: true },
        });

        const login = account?.platformUsername?.toLowerCase();
        // Guard: must be a real login (letters/numbers/underscore), not still a numeric ID
        if (!login || /^\d+$/.test(login)) return;

        const conflict = await prisma.creatorProfile.findUnique({
          where: { slug: login },
        });
        if (conflict) {
          log.info(
            { login, creatorProfileId },
            "Slug already taken — keeping placeholder",
          );
          return;
        }

        await prisma.creatorProfile.update({
          where: { id: creatorProfileId },
          data: { slug: login },
        });

        log.info(
          { slug: login, creatorProfileId },
          "Slug promoted from placeholder",
        );
      });
    }

    // 5. Invalidate Redis cache so public profile page reflects new data immediately.
    await step.run("invalidate-cache", async () => {
      const profile = await prisma.creatorProfile.findUnique({
        where: { id: creatorProfileId },
        select: { slug: true },
      });
      if (profile?.slug) {
        await cacheInvalidate(`creator:${profile.slug}`);
        await cacheInvalidate(`creator:${profile.slug}:*`);
      }
      await cacheInvalidate("trending:landing");
    });

    log.info({ creatorProfileId, platform }, "on-connect snapshot completed");
  },
);
