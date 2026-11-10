import { describe, expect, it } from "vitest";
import { buildRollups } from "./build";
import {
  assignSegmentsToFacts,
  gameMinutesAddNothing,
  gameMinutesForDay,
  splitByWeights,
  type GameSegment,
  type SegmentFact,
} from "./game-minutes";
import type { RollupFact } from "./types";

const DAY = new Date("2026-11-08T00:00:00.000Z");
const at = (iso: string) => new Date(`2026-11-${iso}:00.000Z`).getTime();

describe("splitByWeights", () => {
  it("sums back to the total exactly", () => {
    const shares = splitByWeights(650, [587, 63, 0]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(650);
    expect(shares).toEqual([587, 63, 0]);
  });

  it("gives the remainder to the largest fractions", () => {
    expect(splitByWeights(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it("returns zeros with nothing to split", () => {
    expect(splitByWeights(0, [1, 2])).toEqual([0, 0]);
    expect(splitByWeights(5, [0, 0])).toEqual([0, 0]);
  });
});

describe("gameMinutesForDay", () => {
  it("reads one day and ignores junk", () => {
    const stored = {
      "2026-11-08": { "Grand Theft Auto V": 587, "Just Chatting": 63, x: "1" },
      "2026-11-07": { "Just Chatting": 58 },
    };
    expect(gameMinutesForDay(stored, "2026-11-08")).toEqual({
      "Grand Theft Auto V": 587,
      "Just Chatting": 63,
    });
    expect(gameMinutesForDay(stored, "2026-11-09")).toBeNull();
    expect(gameMinutesForDay(null, "2026-11-08")).toBeNull();
    expect(gameMinutesForDay([], "2026-11-08")).toBeNull();
  });
});

describe("assignSegmentsToFacts", () => {
  const xqc: SegmentFact = {
    id: "f1",
    platformUserId: "71092938",
    platformVideoId: null,
    streamBeginsAt: new Date("2026-11-07T23:02:00.000Z"),
    streamEndsAt: new Date("2026-11-08T09:54:00.000Z"),
  };
  const seg = (
    begins: string,
    ends: string,
    game: string,
    extra: Partial<GameSegment> = {},
  ): GameSegment => ({
    userId: "71092938",
    videoId: null,
    beginsAt: at(begins),
    endsAt: at(ends),
    game,
    ...extra,
  });

  it("adds up the day's stretches per game (xQc, 2026-11-08)", () => {
    const { byFact, unmatchedSegments } = assignSegmentsToFacts(
      [xqc],
      [
        seg("08T00:00", "08T00:02", "Just Chatting"),
        seg("08T00:03", "08T09:50", "Grand Theft Auto V"),
        seg("08T09:51", "08T09:54", "Just Chatting"),
      ],
      DAY,
    );
    expect(unmatchedSegments).toBe(0);
    expect(byFact.get("f1")).toEqual({
      "Just Chatting": 5,
      "Grand Theft Auto V": 587,
    });
  });

  it("counts only the part of a stretch inside the stream", () => {
    const { byFact } = assignSegmentsToFacts(
      [xqc],
      [seg("08T09:00", "08T10:30", "Grand Theft Auto V")],
      DAY,
    );
    expect(byFact.get("f1")).toEqual({ "Grand Theft Auto V": 54 });
  });

  it("keeps time with no game under the empty name", () => {
    const { byFact } = assignSegmentsToFacts(
      [xqc],
      [seg("08T00:00", "08T01:00", "")],
      DAY,
    );
    expect(byFact.get("f1")).toEqual({ "": 60 });
  });

  it("matches YouTube stretches by video id", () => {
    const facts: SegmentFact[] = [
      { ...xqc, id: "a", platformUserId: "UC1", platformVideoId: "vidA" },
      { ...xqc, id: "b", platformUserId: "UC1", platformVideoId: "vidB" },
    ];
    const { byFact } = assignSegmentsToFacts(
      facts,
      [
        seg("08T01:00", "08T02:00", "Minecraft", {
          userId: "UC1",
          videoId: "vidA",
        }),
        seg("08T01:00", "08T02:00", "Fortnite", {
          userId: "UC1",
          videoId: "vidB",
        }),
      ],
      DAY,
    );
    expect(byFact.get("a")).toEqual({ Minecraft: 60 });
    expect(byFact.get("b")).toEqual({ Fortnite: 60 });
  });

  it("reports stretches of streams we do not have", () => {
    const { byFact, unmatchedSegments } = assignSegmentsToFacts(
      [xqc],
      [seg("08T12:00", "08T13:00", "Grand Theft Auto V")],
      DAY,
    );
    expect(byFact.size).toBe(0);
    expect(unmatchedSegments).toBe(1);
  });
});

describe("gameMinutesAddNothing", () => {
  it("skips a single game the whole time", () => {
    expect(gameMinutesAddNothing(["Minecraft"], { minecraft: 120 })).toBe(true);
  });
  it("keeps more than one game, a different game, or time with no game", () => {
    expect(gameMinutesAddNothing(["A", "B"], { A: 1, B: 2 })).toBe(false);
    expect(gameMinutesAddNothing(["A"], { B: 10 })).toBe(false);
    expect(gameMinutesAddNothing(["A"], { A: 10, "": 2 })).toBe(false);
    expect(gameMinutesAddNothing([], { A: 10 })).toBe(false);
  });
  it("skips no game on either side", () => {
    expect(gameMinutesAddNothing([], { "": 30 })).toBe(true);
  });
});

describe("buildRollups with per-game minutes", () => {
  const base: RollupFact = {
    creatorProfileId: "creator-xqc",
    platformUserId: "71092938",
    platformUsername: "xqc",
    platformDisplayName: "xQc",
    platformLogoUrl: null,
    country: "CA",
    streamBeginsAt: new Date("2026-11-08T00:00:00.000Z"),
    streamEndsAt: new Date("2026-11-08T10:00:00.000Z"),
    peakViewersAt: null,
    primaryGameName: "Grand Theft Auto V",
    allGameNames: ["Grand Theft Auto V", "Just Chatting"],
    airtimeMinutes: 600,
    minutesWatched: 600n * 20_000n,
    sessionViews: null,
    averageViewers: 20_000,
    averageViewersGlobal: null,
    peakViewers: 30_000,
    bestRank: null,
    averageRank: null,
    worstRank: null,
  };
  const context = {
    source: "streamhatchet",
    platform: "twitch",
    date: DAY,
    matchedOnly: false,
  };
  const byGame = (rows: { gameName: string; airtimeMinutes: number }[]) =>
    Object.fromEntries(rows.map((r) => [r.gameName, r.airtimeMinutes]));

  it("splits equally without per-game minutes (unchanged)", () => {
    const { channelGame } = buildRollups([base], context);
    expect(byGame(channelGame)).toEqual({
      "Grand Theft Auto V": 300,
      "Just Chatting": 300,
    });
  });

  it("splits by Stream Hatchet's minutes when stored", () => {
    const { channelGame, game, channel } = buildRollups(
      [
        {
          ...base,
          gameMinutesByDay: {
            "2026-11-08": { "Grand Theft Auto V": 540, "Just Chatting": 60 },
          },
        },
      ],
      context,
    );
    expect(byGame(channelGame)).toEqual({
      "Grand Theft Auto V": 540,
      "Just Chatting": 60,
    });
    expect(byGame(game)).toEqual({
      "Grand Theft Auto V": 540,
      "Just Chatting": 60,
    });
    const gta = channelGame.find((r) => r.gameName === "Grand Theft Auto V")!;
    expect(gta.minutesWatched).toBe(540n * 20_000n);
    // The channel's own day is untouched.
    expect(channel[0]!.airtimeMinutes).toBe(600);
    expect(channel[0]!.minutesWatched).toBe(600n * 20_000n);
  });

  it("credits no game for the time listed with none", () => {
    const { channelGame } = buildRollups(
      [
        {
          ...base,
          allGameNames: ["Grand Theft Auto V"],
          gameMinutesByDay: {
            "2026-11-08": { "Grand Theft Auto V": 450, "": 150 },
          },
        },
      ],
      context,
    );
    expect(byGame(channelGame)).toEqual({ "Grand Theft Auto V": 450 });
  });

  it("uses only the day's own entry", () => {
    const { channelGame } = buildRollups(
      [
        {
          ...base,
          gameMinutesByDay: { "2026-11-07": { "Just Chatting": 600 } },
        },
      ],
      context,
    );
    expect(byGame(channelGame)).toEqual({
      "Grand Theft Auto V": 300,
      "Just Chatting": 300,
    });
  });
});
