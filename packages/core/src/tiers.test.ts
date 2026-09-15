import { describe, expect, it } from "vitest";
import { getTierForCreator, TIER_CONFIG } from "./tiers";

describe("getTierForCreator", () => {
  it("maps follower counts to tiers at the configured thresholds", () => {
    const t1 = TIER_CONFIG.tier1.followerThreshold;
    const t2 = TIER_CONFIG.tier2.followerThreshold;
    expect(getTierForCreator(0)).toBe("tier3");
    expect(getTierForCreator(t2 - 1)).toBe("tier3");
    expect(getTierForCreator(t2)).toBe("tier2");
    expect(getTierForCreator(t1 - 1)).toBe("tier2");
    expect(getTierForCreator(t1)).toBe("tier1");
  });

  it("accepts bigint totals", () => {
    expect(getTierForCreator(BigInt(TIER_CONFIG.tier1.followerThreshold))).toBe(
      "tier1",
    );
  });
});
