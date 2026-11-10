import { describe, expect, it } from "vitest";
import { platformFollowerCount } from "./platform-follower-count";

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
