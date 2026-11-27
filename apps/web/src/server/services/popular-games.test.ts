import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@twitchmetrics/database";
import {
  getPopularGames,
  liveIntervalsByDayAndChannel,
  normalizePopularGameName,
  overlapFreeGameAirtime,
  removeGameAirtimeOverlap,
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

  it("ranks by Air Time, then watch time, then real sessions", () => {
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
          gameName: "Air Time winner",
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

    // Hours streamed first (SH's ordering); watch time only breaks ties.
    expect(ranked.map((game) => game.gameName)).toEqual([
      "Air Time winner",
      "Many snapshots",
      "Audience winner",
    ]);
  });

  it("keeps observation-only games below any game with measured airtime", () => {
    const ranked = rankPopularGameContributions(
      [
        {
          gameName: "Observed only",
          platform: "twitch",
          minutesWatched: 100_000n,
          // 500 live samples, not 500 minutes of airtime.
          airtimeMinutes: 500,
          sessionCount: 0,
          observationCount: 500,
          estimated: true,
        },
        {
          gameName: "Measured",
          platform: "twitch",
          minutesWatched: 60n,
          airtimeMinutes: 30,
          sessionCount: 1,
          observationCount: 0,
          estimated: false,
        },
      ],
      3,
    );

    expect(ranked.map((game) => game.gameName)).toEqual([
      "Measured",
      "Observed only",
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
      shChannelGameDaily: { findMany: vi.fn().mockResolvedValue([]) },
      shChannelDaily: { findMany: vi.fn().mockResolvedValue([]) },
      channelGameDailyRollup: { findMany: rollupFindMany },
      streamSessionFact: { findMany: sessionFindMany },
      metricSnapshot: { findMany: snapshotFindMany },
      game: { findMany: gameFindMany },
      platformGameMapping: { findMany: vi.fn().mockResolvedValue([]) },
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
        // Three days earlier: streams that began before the window can
        // still be live inside it.
        where: expect.objectContaining({
          streamBeginsAt: {
            gte: new Date(since.getTime() - 3 * 24 * 60 * 60 * 1000),
          },
        }),
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
  it("ranks SH's names for one game as one row, linked to the catalog game", async () => {
    const rollup = (gameName: string, minutesWatched: bigint) => ({
      platform: "twitch",
      platformUserId: "channel-1",
      date: new Date("2026-07-10T00:00:00.000Z"),
      gameName,
      sessionCount: 1,
      airtimeMinutes: 60,
      minutesWatched,
    });
    const catalog = [
      { id: "cs2", name: "Counter-Strike 2", slug: "counter-strike-2" },
    ];
    const prisma = {
      platformAccount: { findMany: vi.fn().mockResolvedValue([]) },
      shChannelGameDaily: { findMany: vi.fn().mockResolvedValue([]) },
      shChannelDaily: { findMany: vi.fn().mockResolvedValue([]) },
      channelGameDailyRollup: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            rollup("Counter-Strike", 6_000n),
            rollup("counter-strike 2", 3_000n),
          ]),
      },
      streamSessionFact: { findMany: vi.fn().mockResolvedValue([]) },
      metricSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      game: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(catalog)
          .mockResolvedValue([
            { ...catalog[0], coverImageUrl: null, twitchGameId: null },
          ]),
      },
      platformGameMapping: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { platformGameName: "Counter-Strike", gameId: "cs2" },
          ]),
      },
    } as unknown as PrismaClient;

    const games = await getPopularGames(prisma, {
      creatorProfileId: "creator-id",
      limit: 6,
    });

    expect(games).toEqual([
      expect.objectContaining({
        gameName: "Counter-Strike 2",
        slug: "counter-strike-2",
        streamCount: 2,
        airtimeMinutes: 120,
      }),
    ]);
  });
});

/**
 * A creator's game airtime counts time once across channels, as Stream
 * Hatchet BI's combined view does (QA round 3, 2026-11).
 */
describe("overlapFreeGameAirtime", () => {
  it("leaves a single channel as it is", () => {
    expect(
      overlapFreeGameAirtime([{ airtimeMinutes: 200, live: [[0, 300]] }]),
    ).toBe(200);
  });

  it("counts a simulcast once", () => {
    // TheBurntPeanut: the same 4 h stream on Twitch and Kick, half of it
    // on this game.
    expect(
      overlapFreeGameAirtime([
        { airtimeMinutes: 120, live: [[600, 840]] },
        { airtimeMinutes: 120, live: [[600, 840]] },
      ]),
    ).toBeCloseTo(120);
  });

  it("does not add a live stream on top of a 24/7 channel", () => {
    // HasanAbi: 8 h live while the waiting room runs all day.
    expect(
      overlapFreeGameAirtime([
        { airtimeMinutes: 480, live: [[900, 1380]] },
        { airtimeMinutes: 1440, live: [[0, 1440]] },
      ]),
    ).toBeCloseTo(1440);
  });

  it("adds channels that were live at different times", () => {
    expect(
      overlapFreeGameAirtime([
        { airtimeMinutes: 180, live: [[0, 180]] },
        { airtimeMinutes: 180, live: [[600, 780]] },
      ]),
    ).toBeCloseTo(360);
  });

  it("stays between the largest channel and the sum on a partial overlap", () => {
    const airtime = overlapFreeGameAirtime([
      { airtimeMinutes: 100, live: [[0, 200]] },
      { airtimeMinutes: 300, live: [[100, 400]] },
    ]);
    expect(airtime).toBeGreaterThanOrEqual(300);
    expect(airtime).toBeLessThanOrEqual(400);
    // 0-100 at half share, 100-400 at full share.
    expect(airtime).toBeCloseTo(350);
  });

  it("adds a channel with no known live time in full", () => {
    expect(
      overlapFreeGameAirtime([
        { airtimeMinutes: 60, live: [] },
        { airtimeMinutes: 90, live: [[0, 90]] },
      ]),
    ).toBeCloseTo(150);
  });
});

describe("liveIntervalsByDayAndChannel", () => {
  it("splits a stream at UTC midnight", () => {
    const live = liveIntervalsByDayAndChannel([
      {
        channelKey: "twitch:1",
        beginsAt: new Date("2026-11-10T22:00:00Z"),
        endsAt: new Date("2026-11-11T03:00:00Z"),
      },
    ]);
    expect(live.get("2026-11-10 twitch:1")).toEqual([[1320, 1440]]);
    expect(live.get("2026-11-11 twitch:1")).toEqual([[0, 180]]);
  });
});

describe("removeGameAirtimeOverlap", () => {
  const row = (
    channelKey: string,
    gameName: string,
    airtimeMinutes: number,
    dayKey = "2026-11-10",
  ) => ({
    gameName,
    platform: "twitch" as const,
    minutesWatched: 1000n,
    airtimeMinutes,
    sessionCount: 1,
    observationCount: 0,
    estimated: false,
    dayKey,
    channelKey,
  });

  it("scales a game's rows of one day down and keeps watch time", () => {
    const rows = [
      row("twitch:main", "Rob Run", 120),
      row("kick:main", "rob run", 120),
      row("twitch:main", "Rob Run", 120, "2026-11-11"),
    ];
    removeGameAirtimeOverlap(
      rows,
      new Map([
        ["2026-11-10 twitch:main", [[600, 720]]],
        ["2026-11-10 kick:main", [[600, 720]]],
      ]),
    );
    expect(rows[0]!.airtimeMinutes + rows[1]!.airtimeMinutes).toBeCloseTo(120);
    // Another day, one channel: untouched.
    expect(rows[2]!.airtimeMinutes).toBe(120);
    expect(rows.every((r) => r.minutesWatched === 1000n)).toBe(true);
  });

  it("leaves different games on overlapping channels alone", () => {
    const rows = [
      row("twitch:main", "Rob Run", 120),
      row("twitch:reruns", "Always On", 1440),
    ];
    removeGameAirtimeOverlap(
      rows,
      new Map([
        ["2026-11-10 twitch:main", [[600, 720]]],
        ["2026-11-10 twitch:reruns", [[0, 1440]]],
      ]),
    );
    expect(rows.map((r) => r.airtimeMinutes)).toEqual([120, 1440]);
  });
});

describe("getPopularGames with Stream Hatchet's channel and game file", () => {
  const date = new Date("2026-11-20T00:00:00.000Z");
  const fileRow = (
    platform: string,
    gameName: string,
    airtimeMinutes: number,
    minutesWatched: bigint,
  ) => ({
    platform,
    platformUserId: "main",
    date,
    gameName,
    airtimeMinutes,
    minutesWatched,
  });

  it("takes a platform from the file and leaves its rollups out", async () => {
    const prisma = {
      platformAccount: { findMany: vi.fn().mockResolvedValue([]) },
      shChannelGameDaily: {
        findMany: vi.fn().mockResolvedValue([
          fileRow("twitch", "Rob Run", 120, 12_000n),
          fileRow("kick", "Rob Run", 120, 6_000n),
          // A YouTube stream with no game tagged.
          fileRow("yt", "", 300, 9_000n),
        ]),
      },
      shChannelDaily: {
        findMany: vi.fn().mockResolvedValue([
          {
            platform: "twitch",
            platformUserId: "main",
            date,
            intervals: [[600, 720]],
          },
          {
            platform: "kick",
            platformUserId: "main",
            date,
            intervals: [[600, 720]],
          },
        ]),
      },
      channelGameDailyRollup: {
        findMany: vi.fn().mockResolvedValue([
          {
            platform: "twitch",
            platformUserId: "main",
            date,
            gameName: "Rob Run",
            sessionCount: 1,
            airtimeMinutes: 500,
            minutesWatched: 50_000n,
          },
          {
            platform: "ytg",
            platformUserId: "main",
            date,
            gameName: "Old Game",
            sessionCount: 1,
            airtimeMinutes: 500,
            minutesWatched: 50_000n,
          },
        ]),
      },
      streamSessionFact: { findMany: vi.fn().mockResolvedValue([]) },
      metricSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      game: { findMany: vi.fn().mockResolvedValue([]) },
      platformGameMapping: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    const games = await getPopularGames(prisma, {
      creatorProfileId: "creator-id",
      limit: 6,
      now: new Date("2026-11-27T12:00:00.000Z"),
    });

    // The simulcast counts once (120 minutes, not 240); watch time adds up.
    expect(games).toEqual([
      expect.objectContaining({
        gameName: "Rob Run",
        airtimeMinutes: 120,
        avgViewers: 150,
        platforms: ["kick", "twitch"],
        measurement: "measured",
      }),
    ]);
  });
});
