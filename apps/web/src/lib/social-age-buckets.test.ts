import { describe, expect, it } from "vitest";
import { SOCIAL_AGE_LABELS, labeledBars } from "./social-age-buckets";

describe("social age buckets", () => {
  // Caedrel's YouTube report as stored (DP keys, 0-100). BI shows these same
  // values as 16 & under 0.35, 17-19 2.88, 20-24 14.29, 25-29 34.83,
  // 30-34 31.87, 35+ 15.78 (QA 2026-11-13).
  const caedrelYouTube = {
    "age 17 and under": 0.347,
    "age 18 to 20": 2.88,
    "age 21 to 24": 14.29,
    "age 25 to 29": 34.828,
    "age 30 to 34": 31.872,
    "age 35 to 44": 14.078,
    "age 45 to 54": 1.281,
    "age 55 to 64": 0.411,
    "age 65 and over": 0.012,
  };

  it("labels the DP buckets the way Stream Hatchet BI does", () => {
    const bars = labeledBars(caedrelYouTube, SOCIAL_AGE_LABELS)!;
    expect(bars.map((b) => b.range)).toEqual([
      "16 & under",
      "17-19",
      "20-24",
      "25-29",
      "30-34",
      "35+",
    ]);
    expect(bars.map((b) => Math.round(b.percentage * 10_000) / 100)).toEqual([
      0.35, 2.88, 14.29, 34.83, 31.87, 15.78,
    ]);
  });

  it("drops empty buckets and returns null for an empty report", () => {
    expect(
      labeledBars(
        { "age 25 to 29": 60, "age 30 to 34": 40 },
        SOCIAL_AGE_LABELS,
      ),
    ).toEqual([
      { range: "25-29", percentage: 0.6 },
      { range: "30-34", percentage: 0.4 },
    ]);
    expect(labeledBars(null, SOCIAL_AGE_LABELS)).toBeNull();
    expect(labeledBars({}, SOCIAL_AGE_LABELS)).toBeNull();
  });
});
