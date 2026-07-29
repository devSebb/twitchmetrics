import { describe, expect, it } from "vitest";
import {
  computeGrowthFromSnapshots,
  determineAcceleration,
  determineTrend,
  findClosestSnapshot,
  pctChange,
  type SnapshotPoint,
} from "./creator-growth";

const NOW = new Date("2026-07-28T12:00:00.000Z");

function snap(daysAgo: number, followers: number): SnapshotPoint {
  return {
    snapshotAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000),
    followerCount: BigInt(followers),
  };
}

describe("findClosestSnapshot", () => {
  const snapshots = [snap(0, 1000), snap(6, 900), snap(31, 500)];

  it("returns the closest snapshot inside the tolerance window", () => {
    const target = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(findClosestSnapshot(snapshots, target, 2)).toBe(snapshots[1]);
  });

  it("returns null when nothing falls inside the window", () => {
    const target = new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000);
    expect(findClosestSnapshot(snapshots, target, 2)).toBeNull();
  });
});

describe("pctChange", () => {
  it("is null for a missing or zero base — unknown, not 0%", () => {
    expect(pctChange(1000n, null)).toBeNull();
    expect(pctChange(1000n, 0n)).toBeNull();
    expect(pctChange(null, 500n)).toBeNull();
  });

  it("computes signed percentage change", () => {
    expect(pctChange(1100n, 1000n)).toBeCloseTo(10);
    expect(pctChange(900n, 1000n)).toBeCloseTo(-10);
  });
});

describe("determineTrend / determineAcceleration", () => {
  it("treats unknown pct as FLAT/STABLE", () => {
    expect(determineTrend(null)).toBe("FLAT");
    expect(determineAcceleration(null, 5)).toBe("STABLE");
    expect(determineAcceleration(5, null)).toBe("STABLE");
  });

  it("thresholds at ±0.5", () => {
    expect(determineTrend(0.6)).toBe("UP");
    expect(determineTrend(-0.6)).toBe("DOWN");
    expect(determineTrend(0.4)).toBe("FLAT");
  });
});

describe("computeGrowthFromSnapshots", () => {
  it("returns null with no snapshots", () => {
    expect(computeGrowthFromSnapshots([], NOW)).toBeNull();
  });

  it("marks everything unknown with a single snapshot", () => {
    const rollup = computeGrowthFromSnapshots([snap(0, 1000)], NOW)!;
    expect(rollup.followerCount).toBe(1000n);
    expect(rollup.delta7d).toBeNull();
    expect(rollup.pct7d).toBeNull();
    expect(rollup.trendDirection).toBe("FLAT");
  });

  it("computes real deltas when comparison snapshots exist", () => {
    const rollup = computeGrowthFromSnapshots(
      [
        snap(0, 1100),
        snap(1, 1080),
        snap(7, 1000),
        snap(14, 950),
        snap(30, 800),
      ],
      NOW,
    )!;
    expect(rollup.delta1d).toBe(20n);
    expect(rollup.delta7d).toBe(100n);
    expect(rollup.delta30d).toBe(300n);
    expect(rollup.pct7d).toBeCloseTo(10);
    expect(rollup.trendDirection).toBe("UP");
  });

  it("nulls only the windows whose comparison snapshot is missing", () => {
    // Gap: nothing near 7d (±2d) — but 1d and 30d exist.
    const rollup = computeGrowthFromSnapshots(
      [snap(0, 1100), snap(1, 1080), snap(30, 800)],
      NOW,
    )!;
    expect(rollup.delta1d).toBe(20n);
    expect(rollup.delta7d).toBeNull();
    expect(rollup.pct7d).toBeNull();
    expect(rollup.delta30d).toBe(300n);
    // Unknown 7d pct must not fabricate a trend.
    expect(rollup.trendDirection).toBe("FLAT");
    expect(rollup.acceleration).toBe("STABLE");
  });

  it("distinguishes measured-flat (0) from unknown (null)", () => {
    const rollup = computeGrowthFromSnapshots(
      [snap(0, 1000), snap(7, 1000)],
      NOW,
    )!;
    expect(rollup.delta7d).toBe(0n);
    expect(rollup.pct7d).toBe(0);
  });
});
