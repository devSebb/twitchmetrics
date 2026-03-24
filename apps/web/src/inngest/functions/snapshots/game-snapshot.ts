import { prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import {
  twitchAdapter,
  fetchClipsByGame,
  fetchStreamsByGame,
} from "@/server/adapters/twitch";
import { createLogger } from "@/lib/logger";
import { cacheInvalidate } from "@/server/services/cache";

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
          select: { id: true, slug: true },
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

        // Invalidate cache for this game (non-blocking)
        try {
          await cacheInvalidate(`game:${game.slug}`);
          await cacheInvalidate(`game:${game.slug}:*`);
        } catch {
          // Non-blocking
        }
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

    // --------------------------------------------------------
    // Enrich: broadcast languages
    // --------------------------------------------------------
    await step.run("enrich-broadcast-languages", async () => {
      const games = await prisma.game.findMany({
        where: { twitchGameId: { not: null } },
        select: { id: true, twitchGameId: true },
      });

      for (const game of games) {
        try {
          const streams = await fetchStreamsByGame(game.twitchGameId!, 3);
          if (streams.length === 0) continue;

          // Count languages
          const counts: Record<string, number> = {};
          for (const s of streams) {
            counts[s.language] = (counts[s.language] ?? 0) + 1;
          }
          const total = streams.length;

          // Build top-5 sorted by count
          const sorted = Object.entries(counts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

          for (const [lang, count] of sorted) {
            const percent = (count / total) * 100;
            await prisma.gameBroadcastLanguage.upsert({
              where: { gameId_language: { gameId: game.id, language: lang } },
              update: { percent },
              create: {
                gameId: game.id,
                language: lang,
                label:
                  new Intl.DisplayNames(["en"], { type: "language" }).of(
                    lang,
                  ) ?? lang,
                percent,
              },
            });
          }
        } catch (err) {
          log.warn(
            { gameId: game.id, error: (err as Error).message },
            "Language enrich failed",
          );
        }
      }
    });

    // --------------------------------------------------------
    // Enrich: top channels
    // --------------------------------------------------------
    await step.run("enrich-top-channels", async () => {
      const games = await prisma.game.findMany({
        where: { twitchGameId: { not: null } },
        select: { id: true, twitchGameId: true },
      });

      for (const game of games) {
        try {
          const streams = await fetchStreamsByGame(game.twitchGameId!, 3);
          if (streams.length === 0) continue;

          const sorted = [...streams].sort(
            (a, b) => b.viewerCount - a.viewerCount,
          );

          // Most watched — top 6 by viewerCount
          const mostWatched = sorted.slice(0, 6);
          for (const s of mostWatched) {
            const matchedCreator = await prisma.creatorProfile.findFirst({
              where: { slug: s.userLogin.toLowerCase() },
              select: { slug: true },
            });

            await prisma.gameTopChannel.create({
              data: {
                gameId: game.id,
                channelName: s.userName,
                avatarUrl: null,
                slug: matchedCreator?.slug ?? null,
                category: "most_watched",
                avgViewers: s.viewerCount,
                airtime: 1800, // snapshot interval
                viewerHours: BigInt(Math.floor(s.viewerCount * 0.5)),
              },
            });
          }

          // Fastest growing — next 5 by viewerCount (proxy for growth)
          const fastestGrowing = sorted.slice(6, 11);
          for (const s of fastestGrowing) {
            const matchedCreator = await prisma.creatorProfile.findFirst({
              where: { slug: s.userLogin.toLowerCase() },
              select: { slug: true },
            });

            await prisma.gameTopChannel.create({
              data: {
                gameId: game.id,
                channelName: s.userName,
                avatarUrl: null,
                slug: matchedCreator?.slug ?? null,
                category: "fastest_growing",
                avgViewers: s.viewerCount,
                airtime: 1800,
                viewerHours: BigInt(Math.floor(s.viewerCount * 0.5)),
              },
            });
          }
        } catch (err) {
          log.warn(
            { gameId: game.id, error: (err as Error).message },
            "Top channels enrich failed",
          );
        }
      }
    });

    // --------------------------------------------------------
    // Enrich: game clips
    // --------------------------------------------------------
    await step.run("enrich-game-clips", async () => {
      const games = await prisma.game.findMany({
        where: { twitchGameId: { not: null } },
        select: { id: true, twitchGameId: true },
      });

      for (const game of games) {
        try {
          const clips = await fetchClipsByGame(game.twitchGameId!, 8);
          for (const clip of clips) {
            await prisma.gameClip.upsert({
              where: { gameId_clipId: { gameId: game.id, clipId: clip.id } },
              update: {
                title: clip.title,
                thumbnailUrl: clip.thumbnailUrl,
                url: clip.url,
                viewCount: clip.viewCount,
              },
              create: {
                gameId: game.id,
                clipId: clip.id,
                title: clip.title,
                thumbnailUrl: clip.thumbnailUrl,
                url: clip.url,
                viewCount: clip.viewCount,
                createdAt: new Date(clip.createdAt),
              },
            });
          }
        } catch (err) {
          log.warn(
            { gameId: game.id, error: (err as Error).message },
            "Clip enrich failed",
          );
        }
      }
    });

    // --------------------------------------------------------
    // Update avgLiveChannels from last 7 days of snapshots
    // --------------------------------------------------------
    await step.run("update-avg-live-channels", async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const games = await prisma.game.findMany({
        where: { twitchGameId: { not: null } },
        select: { id: true },
      });

      for (const game of games) {
        const result = await prisma.gameViewerSnapshot.aggregate({
          where: { gameId: game.id, snapshotAt: { gte: since } },
          _avg: { totalChannels: true },
        });

        const avg = Math.floor(result._avg.totalChannels ?? 0);
        if (avg > 0) {
          await prisma.game.update({
            where: { id: game.id },
            data: { avgLiveChannels: avg },
          });
        }
      }
    });

    log.info(snapshotResults, "Game snapshot completed");
    return snapshotResults;
  },
);
