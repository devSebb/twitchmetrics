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
    averageViewers: 0,
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

  /**
   * C28 option C: the export has no viewer series, so each platform's peak is
   * treated as a candidate moment and the other platforms contribute their
   * average while live at it.
   */
  describe("estimated combined peak", () => {
    it("adds the other platform's average when the peaks overlap", () => {
      const rows = buildCreatorRollups(
        [
          fact({
            internalPlatform: "twitch",
            peakViewers: 1000,
            peakViewersAt: new Date("2026-09-10T12:00:00.000Z"),
            averageViewers: 500,
          }),
          fact({
            internalPlatform: "kick",
            platformUserId: "chan-2",
            peakViewers: 300,
            peakViewersAt: new Date("2026-09-10T13:00:00.000Z"),
            averageViewers: 200,
          }),
        ],
        date,
      );

      // Twitch's 1,000 at 12:00 plus Kick's 200 average, which beats Kick's
      // own moment (300 + 500). No single platform owns the figure.
      expect(rows[0]).toMatchObject({
        peakViewers: 1200,
        peakPlatform: null,
      });
    });

    it("falls back to the single-platform max when the streams never overlap", () => {
      const rows = buildCreatorRollups(
        [
          fact({
            internalPlatform: "twitch",
            streamBeginsAt: new Date("2026-09-10T00:00:00.000Z"),
            streamEndsAt: new Date("2026-09-10T06:00:00.000Z"),
            peakViewers: 1000,
            peakViewersAt: new Date("2026-09-10T03:00:00.000Z"),
            averageViewers: 500,
          }),
          fact({
            internalPlatform: "kick",
            platformUserId: "chan-2",
            streamBeginsAt: new Date("2026-09-10T12:00:00.000Z"),
            streamEndsAt: new Date("2026-09-10T18:00:00.000Z"),
            peakViewers: 300,
            peakViewersAt: new Date("2026-09-10T15:00:00.000Z"),
            averageViewers: 200,
          }),
        ],
        date,
      );

      expect(rows[0]).toMatchObject({
        peakViewers: 1000,
        peakPlatform: "twitch",
      });
    });

    it("lets a fact with no peak time contribute only its own peak", () => {
      const rows = buildCreatorRollups(
        [
          fact({
            internalPlatform: "twitch",
            peakViewers: 1000,
            peakViewersAt: null,
            averageViewers: 500,
          }),
          fact({
            internalPlatform: "kick",
            platformUserId: "chan-2",
            peakViewers: 300,
            peakViewersAt: new Date("2026-09-10T13:00:00.000Z"),
            averageViewers: 200,
          }),
        ],
        date,
      );

      // Kick's moment combines to 800; Twitch's unpositioned 1,000 still wins
      // and stays attributed to Twitch.
      expect(rows[0]).toMatchObject({
        peakViewers: 1000,
        peakPlatform: "twitch",
      });
    });

    it("does not add a creator's own concurrent streams on one platform", () => {
      const rows = buildCreatorRollups(
        [
          fact({
            internalPlatform: "twitch",
            peakViewers: 1000,
            peakViewersAt: new Date("2026-09-10T12:00:00.000Z"),
            averageViewers: 500,
          }),
          fact({
            internalPlatform: "twitch",
            platformUserId: "chan-1b",
            peakViewers: 100,
            peakViewersAt: null,
            averageViewers: 400,
          }),
        ],
        date,
      );

      expect(rows[0]).toMatchObject({
        peakViewers: 1000,
        peakPlatform: "twitch",
      });
    });

    it("ignores a peak minute that falls outside the day", () => {
      const rows = buildCreatorRollups(
        [
          fact({
            internalPlatform: "twitch",
            // Runs into the next day; its peak happened after midnight.
            streamBeginsAt: new Date("2026-09-10T22:00:00.000Z"),
            streamEndsAt: new Date("2026-09-11T04:00:00.000Z"),
            peakViewers: 1000,
            peakViewersAt: new Date("2026-09-11T02:00:00.000Z"),
            averageViewers: 500,
          }),
          fact({
            internalPlatform: "kick",
            platformUserId: "chan-2",
            streamBeginsAt: new Date("2026-09-10T22:00:00.000Z"),
            streamEndsAt: new Date("2026-09-11T04:00:00.000Z"),
            peakViewers: 200,
            peakViewersAt: null,
            averageViewers: 300,
          }),
        ],
        date,
      );

      // No combining is possible, so the day keeps the single-platform max.
      expect(rows[0]).toMatchObject({
        peakViewers: 1000,
        peakPlatform: "twitch",
      });
    });
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
