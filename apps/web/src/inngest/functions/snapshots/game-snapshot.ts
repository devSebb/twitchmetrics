import { prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { twitchAdapter } from "@/server/adapters/twitch";
import { createLogger } from "@/lib/logger";

const log = createLogger("game-snapshot");

// Cron: every 30 minutes — fetch top games and write viewer snapshots
export const gameSnapshot = inngest.createFunction(
  { id: "game-snapshot", concurrency: { limit: 1 } },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    const topGames = await step.run("fetch-top-games", async () => {
      return twitchAdapter.fetchTopGames!(100);
    });

    const snapshotResults = await step.run("write-game-snapshots", async () => {
      let matched = 0;
      let unmatched = 0;

      for (const gameData of topGames) {
        // Match to existing Game record by Twitch game ID
        const game = await prisma.game.findUnique({
          where: { twitchGameId: gameData.platformGameId },
          select: { id: true },
        });

        if (!game) {
          unmatched++;
          continue;
        }

        matched++;

        // Write snapshot
        await prisma.gameViewerSnapshot.create({
          data: {
            gameId: game.id,
            snapshotAt: gameData.snapshotAt,
            twitchViewers: gameData.viewerCount,
            twitchChannels: gameData.channelCount,
            totalViewers: gameData.viewerCount,
            totalChannels: gameData.channelCount,
          },
        });

        // Update cached fields on Game
        await prisma.game.update({
          where: { id: game.id },
          data: {
            currentViewers: gameData.viewerCount,
            currentChannels: gameData.channelCount,
            peakViewers24h: {
              // Only update if new value is higher
              set: Math.max(gameData.viewerCount, 0),
            },
          },
        });
      }

      return { matched, unmatched, total: topGames.length };
    });

    // Compute peak viewers for the last 24h from snapshots
    await step.run("update-peak-viewers-24h", async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const games = await prisma.game.findMany({
        where: { twitchGameId: { not: null } },
        select: { id: true },
      });

      for (const game of games) {
        const peak = await prisma.gameViewerSnapshot.findFirst({
          where: {
            gameId: game.id,
            snapshotAt: { gte: since },
          },
          orderBy: { totalViewers: "desc" },
          select: { totalViewers: true },
        });

        if (peak) {
          await prisma.game.update({
            where: { id: game.id },
            data: { peakViewers24h: peak.totalViewers },
          });
        }
      }
    });

    log.info(snapshotResults, "Game snapshot completed");
    return snapshotResults;
  },
);
