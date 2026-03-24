import { prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import {
  fetchTopStreams,
  fetchStreamsByGame,
  fetchUserDetailsByIds,
} from "@/server/adapters/twitch";
import { createLogger } from "@/lib/logger";

const log = createLogger("discover-creators");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function tierFromViewers(viewers: number): "tier1" | "tier2" | "tier3" {
  if (viewers >= 10_000) return "tier1";
  if (viewers >= 1_000) return "tier2";
  return "tier3";
}

/**
 * Daily creator discovery — fetches top live streams globally + per game,
 * dedupes by Twitch user ID, creates new CreatorProfile records for anyone
 * not already in the DB.
 *
 * Runs automatically every day at 6 AM UTC.
 * Can also be manually triggered from the Inngest dashboard at any time.
 */
export const discoverCreators = inngest.createFunction(
  { id: "discover-creators", concurrency: { limit: 1 } },
  [{ cron: "0 6 * * *" }, { event: "creators/discover" }],
  async ({ step }) => {
    // --------------------------------------------------------
    // Step 1: Collect streams — global top + per-game top
    // --------------------------------------------------------
    const rawStreams = await step.run("fetch-streams", async () => {
      // Top 500 globally (5 pages × 100)
      const global = await fetchTopStreams(5);

      // Top streams for each of our tracked games (1 page × 100 each)
      const games = await prisma.game.findMany({
        where: { twitchGameId: { not: null } },
        select: { twitchGameId: true },
      });

      const perGame: typeof global = [];
      for (const game of games) {
        try {
          const streams = await fetchStreamsByGame(game.twitchGameId!, 1);
          perGame.push(...streams);
        } catch {
          // non-blocking
        }
      }

      // Dedupe by userId — keep highest viewerCount per user
      const byUserId = new Map<string, (typeof global)[0]>();
      for (const s of [...global, ...perGame]) {
        const existing = byUserId.get(s.userId);
        if (!existing || s.viewerCount > existing.viewerCount) {
          byUserId.set(s.userId, s);
        }
      }

      return Array.from(byUserId.values());
    });

    log.info({ count: rawStreams.length }, "Collected unique streams");

    // --------------------------------------------------------
    // Step 2: Filter to only new creators (not already in DB)
    // --------------------------------------------------------
    const newStreams = await step.run("filter-new", async () => {
      const userIds = rawStreams.map((s) => s.userId);

      // Find which platformUserIds already exist
      const existing = await prisma.platformAccount.findMany({
        where: { platform: "twitch", platformUserId: { in: userIds } },
        select: { platformUserId: true },
      });
      const existingIds = new Set(existing.map((e) => e.platformUserId));

      return rawStreams.filter((s) => !existingIds.has(s.userId));
    });

    log.info({ newCount: newStreams.length }, "New creators to import");

    if (newStreams.length === 0) {
      return { created: 0, skipped: 0 };
    }

    // --------------------------------------------------------
    // Step 3: Fetch user details (avatars, bios) in batches
    // --------------------------------------------------------
    const userDetails = await step.run("fetch-user-details", async () => {
      const ids = newStreams.map((s) => s.userId);
      return fetchUserDetailsByIds(ids);
    });

    const detailMap = new Map(userDetails.map((u) => [u.id, u]));

    // --------------------------------------------------------
    // Step 4: Create profiles
    // --------------------------------------------------------
    const result = await step.run("create-profiles", async () => {
      let created = 0;
      let skipped = 0;

      for (const stream of newStreams) {
        const detail = detailMap.get(stream.userId);
        const login = detail?.login ?? stream.userLogin;
        const displayName = detail?.displayName ?? stream.userName;
        const avatarUrl = detail?.avatarUrl ?? null;
        const bio = detail?.bio || null;

        // Build unique slug
        const baseSlug = slugify(login || displayName);
        let slug = baseSlug;
        let attempt = 0;
        while (true) {
          const conflict = await prisma.creatorProfile.findUnique({
            where: { slug },
            select: { id: true },
          });
          if (!conflict) break;
          attempt++;
          slug = `${baseSlug}-${attempt}`;
        }

        try {
          await prisma.creatorProfile.create({
            data: {
              displayName,
              slug,
              avatarUrl,
              bio,
              primaryPlatform: "twitch",
              state: "unclaimed",
              snapshotTier: tierFromViewers(stream.viewerCount),
              totalFollowers: BigInt(0), // filled in by snapshot cron
              searchText: `${displayName} ${login}`.toLowerCase(),
              platformAccounts: {
                create: {
                  platform: "twitch",
                  platformUserId: stream.userId,
                  platformUsername: login,
                  platformDisplayName: displayName,
                  platformAvatarUrl: avatarUrl,
                  followerCount: BigInt(0),
                  isOAuthConnected: false,
                },
              },
            },
          });
          created++;
        } catch (err) {
          log.warn({ slug, error: (err as Error).message }, "Skipped creator");
          skipped++;
        }
      }

      return { created, skipped };
    });

    log.info(result, "Creator discovery complete");
    return { ...result, total: rawStreams.length };
  },
);
