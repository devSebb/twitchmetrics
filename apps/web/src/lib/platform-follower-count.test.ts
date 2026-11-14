import { describe, expect, it } from "vitest";
import {
  platformFollowerCount,
  serializedPlatformFollowerCount,
} from "./platform-follower-count";

describe("platformFollowerCount", () => {
  it("adds the creator's other channels on the platform", () => {
    expect(
      platformFollowerCount({
        followerCount: 2_510_000n,
        otherChannelsFollowerCount: 777_430n,
      }),
    ).toBe(3_287_430n);
  });

  it("keeps the channel's own count when no other channels are known", () => {
    expect(
      platformFollowerCount({
        followerCount: 17_400_000n,
        otherChannelsFollowerCount: null,
      }),
    ).toBe(17_400_000n);
    expect(platformFollowerCount({ followerCount: 5 })).toBe(5n);
  });

  it("returns null when nothing is known", () => {
    expect(
      platformFollowerCount({
        followerCount: null,
        otherChannelsFollowerCount: null,
      }),
    ).toBeNull();
  });
});

describe("serializedPlatformFollowerCount", () => {
  it("adds serialized counts the way the header does (QA 2026-11: Rubius YouTube 41M + 14.9M)", () => {
    expect(
      serializedPlatformFollowerCount({
        followerCount: "41000000",
        otherChannelsFollowerCount: "14900000",
      }),
    ).toBe(55_900_000n);
  });

  it("works for callers that never serialized other channels", () => {
    expect(serializedPlatformFollowerCount({ followerCount: "1795884" })).toBe(
      1_795_884n,
    );
  });

  it("treats null and junk as unknown", () => {
    expect(
      serializedPlatformFollowerCount({
        followerCount: null,
        otherChannelsFollowerCount: null,
      }),
    ).toBeNull();
    expect(
      serializedPlatformFollowerCount({
        followerCount: "n/a",
        otherChannelsFollowerCount: "12",
      }),
    ).toBe(12n);
  });
});
