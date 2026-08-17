import { describe, expect, it } from "vitest";
import { followerEvidence, pickCanonical } from "./merge";

type Profile = Parameters<typeof pickCanonical>[0];

function profile(overrides: Partial<Profile> & { id: string }): Profile {
  return {
    state: "unclaimed",
    userId: null,
    totalFollowers: 0n,
    lastStreamAt: null,
    listed: false,
    mergedIntoId: null,
    platformAccounts: [],
    ...overrides,
  };
}

function account(
  platform: Profile["platformAccounts"][number]["platform"],
  followerCount: bigint | null,
  extra: Partial<Profile["platformAccounts"][number]> = {},
): Profile["platformAccounts"][number] {
  return {
    id: `${platform}-${followerCount ?? "null"}`,
    platform,
    platformUserId: `${platform}-uid`,
    followerCount,
    subscriberCount: null,
    discoverySource: null,
    ...extra,
  };
}

describe("followerEvidence", () => {
  it("uses the aggregate when the accounts carry nothing bigger", () => {
    expect(
      followerEvidence(
        profile({
          id: "a",
          totalFollowers: 100n,
          platformAccounts: [account("twitch", 60n)],
        }),
      ),
    ).toBe(100n);
  });

  it("falls back to the biggest tracked account when the aggregate is stale (0)", () => {
    expect(
      followerEvidence(
        profile({
          id: "a",
          totalFollowers: 0n,
          platformAccounts: [account("twitch", 5_923_823n)],
        }),
      ),
    ).toBe(5_923_823n);
  });

  it("reads YouTube audience size from subscriberCount", () => {
    expect(
      followerEvidence(
        profile({
          id: "a",
          platformAccounts: [
            account("youtube", null, { subscriberCount: 60_800_000n }),
          ],
        }),
      ),
    ).toBe(60_800_000n);
  });

  it("ignores link-only social accounts (discoverySource set)", () => {
    expect(
      followerEvidence(
        profile({
          id: "a",
          platformAccounts: [
            account("instagram", 55_000_000n, { discoverySource: "sh-social" }),
          ],
        }),
      ),
    ).toBe(0n);
  });
});

describe("pickCanonical", () => {
  it("claimed profiles always survive", () => {
    const claimed = profile({
      id: "claimed",
      state: "claimed",
      totalFollowers: 10n,
    });
    const big = profile({ id: "big", totalFollowers: 1_000_000n });
    expect(pickCanonical(claimed, big).canonical.id).toBe("claimed");
    expect(pickCanonical(big, claimed).canonical.id).toBe("claimed");
  });

  it("the IShowSpeed case: a 5.9M SH-born main channel with a stale 0 aggregate beats a 51-follower API-born alt", () => {
    // API-born VOD/alt channel: small, but had an aggregate at merge time.
    const alt = profile({
      id: "speedofflinetv",
      totalFollowers: 51n,
      platformAccounts: [account("twitch", 51n)],
    });
    // SH-born main channel: totalFollowers not yet refreshed, but the account
    // itself already carries the real count.
    const main = profile({
      id: "ishowspeed-cc62c6c5",
      totalFollowers: 0n,
      platformAccounts: [account("twitch", 5_923_823n)],
    });
    expect(pickCanonical(alt, main).canonical.id).toBe("ishowspeed-cc62c6c5");
    expect(pickCanonical(main, alt).canonical.id).toBe("ishowspeed-cc62c6c5");
  });

  it("falls through to recency, then stable id order, on equal evidence", () => {
    const older = profile({ id: "b", lastStreamAt: new Date("2026-01-01") });
    const newer = profile({ id: "a", lastStreamAt: new Date("2026-06-01") });
    expect(pickCanonical(older, newer).canonical.id).toBe("a");
    const x = profile({ id: "x" });
    const y = profile({ id: "y" });
    expect(pickCanonical(y, x).canonical.id).toBe("x");
  });
});
