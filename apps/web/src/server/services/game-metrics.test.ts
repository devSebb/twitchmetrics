import { describe, expect, it } from "vitest";
import { deriveGameMetrics, intervalWeights } from "./game-metrics";

describe("deriveGameMetrics", () => {
  it("returns zeroed metrics when no snapshots exist", () => {
    expect(deriveGameMetrics([], new Date("2026-03-28T03:00:00.000Z"))).toEqual(
      {
        currentViewers: 0,
        currentChannels: 0,
        peakViewers24h: 0,
        avgViewers7d: 0,
        avgLiveChannels: 0,
        hoursWatched7d: 0n,
      },
    );
  });

  it("derives current, peak, averages, and viewer hours from recent snapshots", () => {
    const now = new Date("2026-03-28T03:00:00.000Z");
    const snapshots = [
      {
        snapshotAt: new Date("2026-03-28T01:30:00.000Z"),
        totalViewers: 100,
        totalChannels: 10,
      },
      {
        snapshotAt: new Date("2026-03-28T02:00:00.000Z"),
        totalViewers: 200,
        totalChannels: 20,
      },
      {
        snapshotAt: new Date("2026-03-28T02:30:00.000Z"),
        totalViewers: 300,
        totalChannels: 30,
      },
    ];

    expect(deriveGameMetrics(snapshots, now)).toEqual({
      currentViewers: 300,
      currentChannels: 30,
      peakViewers24h: 300,
      avgViewers7d: 200,
      avgLiveChannels: 20,
      hoursWatched7d: 300n,
    });
  });

  it("ignores snapshots outside the rolling windows for peak and averages", () => {
    const now = new Date("2026-03-28T03:00:00.000Z");
    const snapshots = [
      {
        snapshotAt: new Date("2026-03-20T03:00:00.000Z"),
        totalViewers: 999,
        totalChannels: 99,
      },
      {
        snapshotAt: new Date("2026-03-27T23:00:00.000Z"),
        totalViewers: 100,
        totalChannels: 10,
      },
      {
        snapshotAt: new Date("2026-03-28T02:30:00.000Z"),
        totalViewers: 200,
        totalChannels: 20,
      },
    ];

    expect(deriveGameMetrics(snapshots, now)).toEqual({
      currentViewers: 200,
      currentChannels: 20,
      peakViewers24h: 200,
      avgViewers7d: 150,
      avgLiveChannels: 15,
      hoursWatched7d: 150n,
    });
  });

  it("does not let a cluster of duplicate-timestamp snapshots skew the averages", () => {
    const now = new Date("2026-03-28T03:00:00.000Z");
    const at = (iso: string, viewers: number) => ({
      snapshotAt: new Date(iso),
      totalViewers: viewers,
      totalChannels: viewers / 10,
    });
    // One retried slot wrote the same spike five times; an unweighted mean
    // would be (5×1000 + 100 + 100) / 7 ≈ 742.
    const snapshots = [
      at("2026-03-28T01:30:00.000Z", 100),
      ...Array.from({ length: 5 }, () => at("2026-03-28T02:00:00.000Z", 1000)),
      at("2026-03-28T02:30:00.000Z", 100),
    ];
    const metrics = deriveGameMetrics(snapshots, now);
    expect(metrics.avgViewers7d).toBe(400);
    expect(metrics.avgLiveChannels).toBe(40);
    expect(metrics.avgViewers7d).toBeLessThanOrEqual(metrics.peakViewers24h);
  });

  it("weights unevenly spaced snapshots by the time they cover", () => {
    const now = new Date("2026-03-28T03:00:00.000Z");
    const snapshots = [
      // covers 30 min (gap to next is 2h, clamped)
      {
        snapshotAt: new Date("2026-03-28T00:00:00.000Z"),
        totalViewers: 400,
        totalChannels: 40,
      },
      // covers 10 min
      {
        snapshotAt: new Date("2026-03-28T02:00:00.000Z"),
        totalViewers: 100,
        totalChannels: 10,
      },
      // last: covers 30 min
      {
        snapshotAt: new Date("2026-03-28T02:10:00.000Z"),
        totalViewers: 100,
        totalChannels: 10,
      },
    ];
    // (400·30 + 100·10 + 100·30) / 70 = 228.57
    expect(deriveGameMetrics(snapshots, now).avgViewers7d).toBe(228);
  });

  it("uses a single snapshot's own values", () => {
    const now = new Date("2026-03-28T03:00:00.000Z");
    const metrics = deriveGameMetrics(
      [
        {
          snapshotAt: new Date("2026-03-28T02:30:00.000Z"),
          totalViewers: 123,
          totalChannels: 7,
        },
      ],
      now,
    );
    expect(metrics.avgViewers7d).toBe(123);
    expect(metrics.avgLiveChannels).toBe(7);
  });
});

describe("intervalWeights", () => {
  it("clamps gaps to 30 minutes and gives the last snapshot 30 minutes", () => {
    const at = (iso: string) => ({
      snapshotAt: new Date(iso),
      totalViewers: 0,
      totalChannels: 0,
    });
    expect(
      intervalWeights([
        at("2026-03-28T00:00:00.000Z"),
        at("2026-03-28T00:00:00.000Z"),
        at("2026-03-28T00:10:00.000Z"),
        at("2026-03-28T05:00:00.000Z"),
      ]),
    ).toEqual([0, 10 * 60_000, 30 * 60_000, 30 * 60_000]);
  });
});
