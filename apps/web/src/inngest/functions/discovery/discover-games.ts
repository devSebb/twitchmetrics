import { prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { twitchAdapter } from "@/server/adapters/twitch";
import { createLogger } from "@/lib/logger";

const log = createLogger("discover-games");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Daily game discovery — fetches top 100 games from Twitch and creates
 * new Game records for any that aren't already tracked.
 *
 * Runs automatically every day at 5 AM UTC (before creator discovery at 6 AM).
 * Can also be manually triggered from the Inngest dashboard.
 */
export const discoverGames = inngest.createFunction(
  { id: "discover-games", concurrency: { limit: 1 } },
  [{ cron: "0 5 * * *" }, { event: "games/discover" }],
  async ({ step }) => {
    // --------------------------------------------------------
    // Step 1: Fetch top 100 games from Twitch
    // --------------------------------------------------------
    const topGames = await step.run("fetch-top-games", async () => {
      return twitchAdapter.fetchTopGames!(100);
    });

    log.info({ count: topGames.length }, "Fetched top games from Twitch");

    // --------------------------------------------------------
    // Step 2: Filter to only new games (not already in DB)
    // --------------------------------------------------------
    const newGames = await step.run("filter-new", async () => {
      const platformIds = topGames.map((g) => g.platformGameId);

      const existing = await prisma.game.findMany({
        where: { twitchGameId: { in: platformIds } },
        select: { twitchGameId: true },
      });
      const existingIds = new Set(
        existing.map((g) => g.twitchGameId).filter(Boolean),
      );

      return topGames.filter((g) => !existingIds.has(g.platformGameId));
    });

    log.info({ newCount: newGames.length }, "New games to import");

    if (newGames.length === 0) {
      return { created: 0, skipped: 0 };
    }

    // --------------------------------------------------------
    // Step 3: Create game records
    // --------------------------------------------------------
    const result = await step.run("create-games", async () => {
      let created = 0;
      let skipped = 0;

      for (const gameData of newGames) {
        // Build unique slug
        const baseSlug = slugify(gameData.gameName);
        let slug = baseSlug;
        let attempt = 0;
        while (true) {
          const conflict = await prisma.game.findUnique({
            where: { slug },
            select: { id: true },
          });
          if (!conflict) break;
          attempt++;
          slug = `${baseSlug}-${attempt}`;
        }

        try {
          await prisma.game.create({
            data: {
              name: gameData.gameName,
              slug,
              twitchGameId: gameData.platformGameId,
              coverImageUrl: gameData.boxArtUrl,
              currentViewers: gameData.viewerCount,
              currentChannels: gameData.channelCount,
              searchText: gameData.gameName.toLowerCase(),
            },
          });
          created++;
        } catch (err) {
          log.warn({ slug, error: (err as Error).message }, "Skipped game");
          skipped++;
        }
      }

      return { created, skipped };
    });

    log.info(result, "Game discovery complete");
    return { ...result, total: topGames.length };
  },
);
