import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@twitchmetrics/database";
import {
  getPopularGames,
  normalizePopularGameName,
  popularGamesWindowStart,
  rankPopularGameContributions,
  snapshotToPopularGameContribution,
} from "./popular-games";

describe("popular game ranking", () => {
  it("normalizes equivalent game names into one identity", () => {
    const ranked = rankPopularGameContributions(
      [
        {
          gameName: "  Grand   Theft Auto V ",
          platform: "twitch",
          minutesWatched: 600n,
          airtimeMinutes: 10,
          sessionCount: 1,
          observationCount: 0,
          estimated: false,
        },
        {
          gameName: "grand theft auto v",
          platform: "kick",
          minutesWatched: 400n,
          airtimeMinutes: 5,
          sessionCount: 1,
          observationCount: 0,
          estimated: false,
        },
      ],
      6,
    );

    expect(normalizePopularGameName("  GRAND   THEFT AUTO V ")).toBe(
      "grand theft auto v",
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({
      minutesWatched: 1000n,
      airtimeMinutes: 15,
      sessionCount: 2,
      platforms: ["kick", "twitch"],
    });
  });

  it("ranks by viewer-minutes, then Air Time, then real sessions", () => {
    const ranked = rankPopularGameContributions(
      [
        {
          gameName: "Many snapshots",
          platform: "twitch",
          minutesWatched: 900n,
          airtimeMinutes: 100,
          sessionCount: 10,
          observationCount: 0,
          estimated: false,
        },
        {
          gameName: "Audience winner",
          platform: "twitch",
          minutesWatched: 1000n,
          airtimeMinutes: 1,
          sessionCount: 1,
          observationCount: 0,
          estimated: false,
        },
        {
          gameName: "Air Time tie-breaker",
          platform: "kick",
          minutesWatched: 900n,
          airtimeMinutes: 120,
          sessionCount: 1,
          observationCount: 0,
          estimated: false,
        },
      ],
      3,
    );

    expect(ranked.map((game) => game.gameName)).toEqual([
      "Audience winner",
      "Air Time tie-breaker",
      "Many snapshots",
    ]);
  });

  it("rejects an offline snapshot even when its configured game is present", () => {
    expect(
      snapshotToPopularGameContribution({
        platform: "twitch",
        extendedMetrics: {
          IS_LIVE: 0,
          CURRENT_GAME: "Just Chatting",
          CURRENT_GAME_ID: "509658",
          AVG_VIEWERS: 1200,
        },
      }),
    ).toBeNull();
  });

  it("counts a live snapshot as an observation, never as a stream", () => {
    expect(
      snapshotToPopularGameContribution({
        platform: "twitch",
        extendedMetrics: {
          IS_LIVE: 1,
          CURRENT_GAME: "Just Chatting",
          CURRENT_GAME_ID: "509658",
          LIVE_VIEWER_COUNT: 1200,
        },
      }),
    ).toMatchObject({
      minutesWatched: 1200n,
      airtimeMinutes: 1,
      sessionCount: 0,
      observationCount: 1,
      estimated: true,
    });
  });

  it("uses one 30-day boundary for every queried source", async () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    const since = popularGamesWindowStart(now);
    const platformAccountFindMany = vi.fn().mockResolvedValue([]);
    const rollupFindMany = vi.fn().mockResolvedValue([]);
    const sessionFindMany = vi.fn().mockResolvedValue([]);
    const snapshotFindMany = vi.fn().mockResolvedValue([
      {
        platform: "twitch",
        extendedMetrics: {
          IS_LIVE: true,
          CURRENT_GAME: "Unlinked Game",
          LIVE_VIEWER_COUNT: 75,
        },
      },
    ]);
    const gameFindMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      platformAccount: { findMany: platformAccountFindMany },
      channelGameDailyRollup: { findMany: rollupFindMany },
      streamSessionFact: { findMany: sessionFindMany },
      metricSnapshot: { findMany: snapshotFindMany },
      game: { findMany: gameFindMany },
    } as unknown as PrismaClient;

    const games = await getPopularGames(prisma, {
      creatorProfileId: "creator-id",
      limit: 6,
      now,
    });

    expect(rollupFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: { gte: since } }),
      }),
    );
    expect(sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ streamBeginsAt: { gte: since } }),
      }),
    );
    expect(snapshotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ snapshotAt: { gte: since } }),
      }),
    );
    expect(games).toEqual([
      expect.objectContaining({
        gameName: "Unlinked Game",
        slug: null,
        streamCount: 0,
        observationCount: 1,
        measurement: "observed",
      }),
    ]);
  });
});
