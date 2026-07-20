import { describe, expect, it } from "vitest";
import {
  getMetricFreshness,
  getLatestTimestamp,
  isRecentObservation,
  VERIFIED_LIVE_MAX_AGE_MS,
} from "./metric-freshness";

const NOW = new Date("2026-07-18T12:00:00.000Z").getTime();

describe("metric freshness", () => {
  it("only treats recent observations as verified live data", () => {
    expect(
      isRecentObservation(
        new Date(NOW - VERIFIED_LIVE_MAX_AGE_MS),
        undefined,
        NOW,
      ),
    ).toBe(true);
    expect(
      isRecentObservation(
        new Date(NOW - VERIFIED_LIVE_MAX_AGE_MS - 1),
        undefined,
        NOW,
      ),
    ).toBe(false);
    expect(isRecentObservation(null, undefined, NOW)).toBe(false);
  });

  it("rejects invalid and future observations", () => {
    expect(isRecentObservation("not-a-date", undefined, NOW)).toBe(false);
    expect(isRecentObservation(new Date(NOW + 60_000), undefined, NOW)).toBe(
      false,
    );
  });

  it("formats fresh, possibly outdated, and outdated timestamps", () => {
    expect(getMetricFreshness(new Date(NOW - 5 * 60_000), NOW)).toEqual({
      relativeTime: "5m ago",
      state: "fresh",
    });
    expect(
      getMetricFreshness(new Date(NOW - 3 * 24 * 60 * 60_000), NOW),
    ).toEqual({ relativeTime: "3d ago", state: "possibly_outdated" });
    expect(
      getMetricFreshness(new Date(NOW - 8 * 24 * 60 * 60_000), NOW),
    ).toEqual({ relativeTime: "8d ago", state: "outdated" });
  });

  it("selects the latest valid source timestamp", () => {
    expect(
      getLatestTimestamp([
        "not-a-date",
        new Date("2026-07-17T12:00:00.000Z"),
        null,
        "2026-07-18T11:00:00.000Z",
      ]),
    ).toEqual(new Date("2026-07-18T11:00:00.000Z"));
  });
});
