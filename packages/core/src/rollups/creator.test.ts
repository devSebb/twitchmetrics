import { describe, expect, it } from "vitest";
import {
  buildCreatorRollups,
  mergeIntervals,
  totalMinutes,
  type CreatorRollupFact,
} from "./creator";

const date = new Date("2026-09-10T00:00:00.000Z");

function fact(overrides: Partial<CreatorRollupFact> = {}): CreatorRollupFact {
  return {
    creatorProfileId: "creator-1",
    internalPlatform: "twitch",
    platformUserId: "chan-1",
    platformUsername: "chan1",
    platformDisplayName: null,
    platformLogoUrl: null,
    country: null,
    streamBeginsAt: new Date("2026-09-10T10:00:00.000Z"),
    streamEndsAt: new Date("2026-09-10T14:00:00.000Z"),
    peakViewersAt: null,
    primaryGameName: null,
    allGameNames: [],
    airtimeMinutes: 240,
    minutesWatched: 0n,
    sessionViews: null,
    averageViewersGlobal: null,
    peakViewers: 0,
    bestRank: null,
    averageRank: null,
    worstRank: null,
    ...overrides,
  };
}

describe("mergeIntervals", () => {
  it("merges overlapping, nested and touching ranges", () => {
    expect(
      mergeIntervals([
        [0, 60],
        [30, 90],
      ]),
    ).toEqual([[0, 90]]);
    expect(
      mergeIntervals([
        [0, 120],
        [30, 60],
      ]),
    ).toEqual([[0, 120]]);
    expect(
      mergeIntervals([
        [0, 60],
        [60, 120],
      ]),
    ).toEqual([[0, 120]]);
  });

  it("keeps disjoint ranges apart and drops empty ones", () => {
    expect(
      mergeIntervals([
        [120, 180],
        [0, 60],
        [30, 30],
      ]),
    ).toEqual([
      [0, 60],
      [120, 180],
    ]);
    expect(totalMinutes([[0, 60]])).toBe(60);
  });
});

describe("buildCreatorRollups", () => {
  it("counts a simulcast once (the QA case)", () => {
    // 4 h on Twitch and YouTube at the same time: 2.4M + 480k watch minutes.
    // Summing per-platform airtime would say 480 min and halve avgViewers.
    const rows = buildCreatorRollups(
      [
        fact({ internalPlatform: "twitch", minutesWatched: 2_400_000n }),
        fact({
          internalPlatform: "youtube",
          platformUserId: "chan-2",
          minutesWatched: 480_000n,
        }),
      ],
      date,
    );

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.uniqueAirtimeMinutes).toBe(240);
    expect(row.streamBlocks).toBe(1);
    expect(row.platforms).toEqual(["twitch", "youtube"]);
    expect(row.minutesWatched).toBe(2_880_000n);
    // The combined concurrent average, not a halved one.
    expect(Number(row.minutesWatched) / row.uniqueAirtimeMinutes).toBe(12_000);
  });

  it("adds up separate streams and counts them as blocks", () => {
    const rows = buildCreatorRollups(
      [
        fact({
          streamBeginsAt: new Date("2026-09-10T01:00:00.000Z"),
          streamEndsAt: new Date("2026-09-10T02:00:00.000Z"),
        }),
        fact({
          streamBeginsAt: new Date("2026-09-10T20:00:00.000Z"),
          streamEndsAt: new Date("2026-09-10T21:30:00.000Z"),
        }),
      ],
      date,
    );
    expect(rows[0]).toMatchObject({
      uniqueAirtimeMinutes: 150,
      streamBlocks: 2,
    });
  });

  it("clips a stream crossing midnight to this day", () => {
    const rows = buildCreatorRollups(
      [
        fact({
          streamBeginsAt: new Date("2026-09-09T22:00:00.000Z"),
          streamEndsAt: new Date("2026-09-10T02:00:00.000Z"),
          minutesWatched: 240n,
        }),
      ],
      date,
    );
    expect(rows[0]!.uniqueAirtimeMinutes).toBe(120);
    // Half the stream is in this day, so half its watch time is too.
    expect(rows[0]!.minutesWatched).toBe(120n);
    expect(rows[0]!.intervals).toEqual([[0, 120]]);
  });

  it("never exceeds a full day", () => {
    const rows = buildCreatorRollups(
      [
        fact({
          streamBeginsAt: new Date("2026-09-08T00:00:00.000Z"),
          streamEndsAt: new Date("2026-09-14T00:00:00.000Z"),
        }),
      ],
      date,
    );
    expect(rows[0]!.uniqueAirtimeMinutes).toBe(1440);
  });

  it("names the platform of the day's best peak", () => {
    const rows = buildCreatorRollups(
      [
        fact({ internalPlatform: "twitch", peakViewers: 100 }),
        fact({
          internalPlatform: "kick",
          platformUserId: "chan-2",
          peakViewers: 900,
        }),
      ],
      date,
    );
    expect(rows[0]).toMatchObject({ peakViewers: 900, peakPlatform: "kick" });
  });

  it("skips unmatched channels and days with no overlap", () => {
    expect(
      buildCreatorRollups([fact({ creatorProfileId: null })], date),
    ).toEqual([]);
    expect(
      buildCreatorRollups(
        [
          fact({
            streamBeginsAt: new Date("2026-09-12T10:00:00.000Z"),
            streamEndsAt: new Date("2026-09-12T12:00:00.000Z"),
          }),
        ],
        date,
      ),
    ).toEqual([]);
  });

  it("separates creators", () => {
    const rows = buildCreatorRollups(
      [fact(), fact({ creatorProfileId: "creator-2" })],
      date,
    );
    expect(rows).toHaveLength(2);
  });
});
