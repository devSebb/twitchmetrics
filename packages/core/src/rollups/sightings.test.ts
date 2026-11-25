import { describe, expect, it } from "vitest";
import { buildRollups } from "./build";
import { buildCreatorRollups, type CreatorRollupFact } from "./creator";
import {
  longRunningDayViewers,
  parseSightings,
  sightingEntry,
} from "./sightings";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(`${iso}:00.000Z`);

/**
 * A stream live since Oct 2 that peaked at 6,072 on Oct 5 and has had about
 * 120 viewers since (Quiet Little Sanctuary, QA 2026-11-24).
 */
function longStream(
  overrides: Partial<CreatorRollupFact> = {},
): CreatorRollupFact {
  return {
    creatorProfileId: "creator-1",
    internalPlatform: "youtube",
    platformUserId: "chan-1",
    platformUsername: "chan1",
    platformDisplayName: null,
    platformLogoUrl: null,
    country: null,
    streamBeginsAt: day("2026-10-02"),
    streamEndsAt: at("2026-11-23T23:59"),
    peakViewersAt: at("2026-10-05T15:37"),
    primaryGameName: "Music",
    allGameNames: [],
    airtimeMinutes: 76319,
    minutesWatched: 9_332_087n,
    sessionViews: null,
    averageViewers: 122,
    averageViewersGlobal: null,
    peakViewers: 6072,
    bestRank: null,
    averageRank: null,
    worstRank: null,
    sightingsByDay: {
      "2026-11-21": [100, 900, at("2026-11-19T18:00").getTime() / 1000],
      "2026-11-22": [110, 1142, at("2026-11-22T20:10").getTime() / 1000],
      "2026-11-23": [120, 1142, at("2026-11-22T20:10").getTime() / 1000],
    },
    ...overrides,
  };
}

describe("parseSightings", () => {
  it("reads the stored shape and ignores anything else", () => {
    const parsed = parseSightings({
      "2026-11-23": sightingEntry({
        averageViewers: 120.5,
        peakViewers: 300,
        peakViewersAt: at("2026-11-22T20:10"),
      }),
      "2026-11-22": [110, 250, null],
      "not-a-day": [1, 2, 3],
      "2026-11-21": "broken",
    });
    expect(parsed.map((s) => s.exportDay.toISOString().slice(0, 10))).toEqual([
      "2026-11-22",
      "2026-11-23",
    ]);
    expect(parsed[0]?.peakViewersAt).toBeNull();
    expect(parsed[1]?.peakViewersAt).toEqual(at("2026-11-22T20:10"));
    expect(parseSightings(null)).toEqual([]);
    expect(parseSightings([1, 2])).toEqual([]);
  });
});

describe("longRunningDayViewers", () => {
  it("leaves an ordinary stream alone", () => {
    const short = longStream({
      streamBeginsAt: at("2026-11-22T10:00"),
      streamEndsAt: at("2026-11-23T02:00"),
    });
    expect(longRunningDayViewers(short, day("2026-11-22"))).toBeNull();
  });

  it("leaves a full 72 h block alone", () => {
    const block = longStream({
      streamBeginsAt: day("2026-11-21"),
      streamEndsAt: at("2026-11-23T23:59"),
    });
    expect(longRunningDayViewers(block, day("2026-11-22"))).toBeNull();
  });

  it("puts a peak on the day it happened, not on every day", () => {
    const fact = longStream();
    expect(longRunningDayViewers(fact, day("2026-11-22"))).toMatchObject({
      peakViewers: 1142,
      peakViewersAt: at("2026-11-22T20:10"),
    });
    // The all-time peak stays on Oct 5.
    expect(longRunningDayViewers(fact, day("2026-10-05"))).toMatchObject({
      peakViewers: 6072,
    });
  });

  it("gives a day no export points at its average, never another day's peak", () => {
    const viewers = longRunningDayViewers(longStream(), day("2026-11-23"));
    expect(viewers?.averageViewers).toBe(120);
    expect(viewers?.peakViewers).toBe(120);
    expect(viewers?.peakViewersAt).toBeNull();
  });

  it("averages the exports whose window covers the day", () => {
    // Nov 21 is inside the exports of Nov 21, 22 and 23.
    expect(
      longRunningDayViewers(longStream(), day("2026-11-21"))?.averageViewers,
    ).toBe(110);
    // Nov 22: exports of Nov 22 and 23.
    expect(
      longRunningDayViewers(longStream(), day("2026-11-22"))?.averageViewers,
    ).toBe(115);
  });

  it("falls back to the lifetime average where no export is stored", () => {
    const viewers = longRunningDayViewers(longStream(), day("2026-10-20"));
    expect(viewers).toEqual({
      averageViewers: 122,
      peakViewers: 122,
      peakViewersAt: null,
    });
  });
});

describe("rollups of a long-running stream", () => {
  it("creator rollup: the day's own peak and watch time", () => {
    const [row] = buildCreatorRollups([longStream()], day("2026-11-22"));
    expect(row?.peakViewers).toBe(1142);
    expect(row?.uniqueAirtimeMinutes).toBe(1440);
    expect(row?.minutesWatched).toBe(BigInt(115 * 1440));
  });

  it("creator rollup: an ordinary stream the same day can still hold the peak", () => {
    const short: CreatorRollupFact = longStream({
      platformUserId: "chan-2",
      streamBeginsAt: at("2026-11-23T12:00"),
      streamEndsAt: at("2026-11-23T14:00"),
      airtimeMinutes: 120,
      minutesWatched: 60_000n,
      averageViewers: 500,
      peakViewers: 800,
      peakViewersAt: at("2026-11-23T13:00"),
      sightingsByDay: null,
    });
    const [row] = buildCreatorRollups([longStream(), short], day("2026-11-23"));
    expect(row?.peakViewers).toBe(800);
  });

  it("channel rollup: same figures, and average = watch time / airtime", () => {
    const { channel } = buildRollups([longStream()], {
      source: "streamhatchet",
      platform: "yt",
      date: day("2026-11-22"),
      matchedOnly: false,
    });
    expect(channel).toHaveLength(1);
    expect(channel[0]?.peakViewers).toBe(1142);
    expect(channel[0]?.peakViewersAt).toEqual(at("2026-11-22T20:10"));
    expect(channel[0]?.airtimeMinutes).toBe(1440);
    expect(channel[0]?.averageViewers).toBeCloseTo(115, 5);
  });
});
