import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tier snapshot runner behaviour added for the GitHub move (PLAN-infra
 * step 3): Upstash failures never fail a run, sharding, resume after a
 * partial run, the time budget, batched YouTube lookups and the "tier"
 * Twitch priority.
 */

const mocks = vi.hoisted(() => {
  const fetchSnapshot = vi.fn();
  return {
    fetchSnapshot,
    getAdapter: vi.fn(() => ({ fetchSnapshot })),
    fetchChannelsByIds: vi.fn(),
    invalidateCreatorCacheOrThrow: vi.fn(async (_slug: string) => {}),
    cacheInvalidateOrThrow: vi.fn(async (_pattern: string) => 0),
    isCacheConfigured: vi.fn(() => true),
    priorities: [] as Array<string | null>,
    profiles: [] as Array<{
      id: string;
      platformAccounts: Array<{
        id: string;
        platform: string;
        platformUserId: string;
      }>;
    }>,
    existingSnapshots: [] as Array<{
      creatorProfileId: string;
      platform: string;
    }>,
    prisma: {
      creatorProfile: {
        findMany: vi.fn(),
        update: vi.fn(async (_args: unknown) => ({})),
        findUnique: vi.fn(async (_args: unknown) => ({ slug: "slug" })),
      },
      platformAccount: { update: vi.fn(async (_args: unknown) => ({})) },
      metricSnapshot: {
        create: vi.fn(async (_args: unknown) => ({})),
        findMany: vi.fn(async (_args: unknown) => [] as unknown[]),
      },
    },
  };
});

vi.mock("@twitchmetrics/database", async () => {
  const actual = await vi.importActual<
    typeof import("@twitchmetrics/database")
  >("@twitchmetrics/database");
  return { ...actual, prisma: mocks.prisma };
});
vi.mock("@/server/adapters", () => ({ getAdapter: mocks.getAdapter }));
vi.mock("@/server/adapters/youtube", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/adapters/youtube")
  >("@/server/adapters/youtube");
  return { ...actual, fetchChannelsByIds: mocks.fetchChannelsByIds };
});
vi.mock("@/server/services/cache", () => ({
  cacheInvalidateOrThrow: mocks.cacheInvalidateOrThrow,
  isCacheConfigured: mocks.isCacheConfigured,
}));
vi.mock("@/server/services/creator-cache", () => ({
  invalidateCreatorCacheOrThrow: mocks.invalidateCreatorCacheOrThrow,
}));
vi.mock("@twitchmetrics/core/creator-aggregates", () => ({
  recomputeCreatorAggregates: vi.fn(),
}));
vi.mock("@/server/services/creator-growth", () => ({
  recomputeCreatorGrowthRollups: vi.fn(),
}));
vi.mock("@/server/services/clip-sync", () => ({
  refreshCreatorClips: vi.fn(),
}));
vi.mock("@/lib/encryption", () => ({ decryptToken: vi.fn() }));

import { currentTwitchPriority } from "@/server/adapters/twitch-rate";
import { profileShard, runTierSnapshot, tierRunSummary } from "./shared";

const step = {
  run: async (_id: string, fn: () => Promise<unknown>) => fn(),
  sleep: async () => undefined,
};

function account(id: string, platform: string, platformUserId = id) {
  return { id, platform, platformUserId };
}

const twitchSnapshot = {
  platform: "twitch",
  snapshotAt: new Date("2026-10-26T03:00:00Z"),
  followerCount: 10n,
  followingCount: null,
  totalViews: null,
  subscriberCount: null,
  postCount: null,
  extendedMetrics: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.priorities.length = 0;
  mocks.existingSnapshots = [];
  mocks.isCacheConfigured.mockReturnValue(true);
  mocks.invalidateCreatorCacheOrThrow.mockReset().mockResolvedValue(undefined);
  mocks.fetchChannelsByIds.mockReset();
  mocks.profiles = [
    { id: "p1", platformAccounts: [account("a1", "twitch")] },
    { id: "p2", platformAccounts: [account("a2", "twitch")] },
  ];
  mocks.prisma.creatorProfile.findMany.mockImplementation(
    async (args: {
      select: Record<string, unknown>;
      where: { id?: { in: string[] } };
    }) =>
      Object.keys(args.select).length === 1
        ? mocks.profiles.map((p) => ({ id: p.id }))
        : mocks.profiles
            .filter((p) => args.where.id?.in.includes(p.id))
            .map((p) => ({
              ...p,
              totalFollowers: 0n,
              snapshotTier: "tier3",
              platformAccounts: p.platformAccounts.map((a) => ({
                ...a,
                isOAuthConnected: false,
                accessToken: null,
                notFoundCount: 0,
              })),
            })),
  );
  mocks.prisma.metricSnapshot.findMany.mockImplementation(
    async () => mocks.existingSnapshots,
  );
  mocks.fetchSnapshot.mockImplementation(async () => {
    mocks.priorities.push(currentTwitchPriority());
    return twitchSnapshot;
  });
});

describe("Upstash failures never fail a tier run", () => {
  it("keeps snapshotting and stops calling Redis after the first error", async () => {
    mocks.invalidateCreatorCacheOrThrow.mockRejectedValue(
      new Error("ERR max requests limit exceeded. Limit: 500000"),
    );

    const result = await runTierSnapshot("tier3", step);

    expect(result.processed).toBe(2);
    expect(result.errors).toBe(0);
    // One failed call, then off for the run (not one per creator).
    expect(mocks.invalidateCreatorCacheOrThrow).toHaveBeenCalledTimes(1);
    expect(mocks.cacheInvalidateOrThrow).not.toHaveBeenCalled();
    expect(result.cacheInvalidation).toMatch(/^off \(ERR max requests/);
  });

  it("skips Redis entirely when Upstash isn't configured", async () => {
    mocks.isCacheConfigured.mockReturnValue(false);

    const result = await runTierSnapshot("tier3", step);

    expect(result.processed).toBe(2);
    expect(mocks.invalidateCreatorCacheOrThrow).not.toHaveBeenCalled();
    expect(result.cacheInvalidation).toMatch(/^off \(not configured\)/);
  });

  it("invalidates normally when Redis works", async () => {
    const result = await runTierSnapshot("tier3", step);
    expect(mocks.invalidateCreatorCacheOrThrow).toHaveBeenCalledTimes(2);
    expect(result.cacheInvalidation).toBe("on");
  });
});

describe("sharding", () => {
  it("splits profiles into disjoint shards that cover the tier", async () => {
    mocks.profiles = Array.from({ length: 40 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      platformAccounts: [account(`a${i}`, "twitch")],
    }));

    const a = await runTierSnapshot("tier3", step, {
      shard: { index: 0, count: 2 },
    });
    const b = await runTierSnapshot("tier3", step, {
      shard: { index: 1, count: 2 },
    });

    expect(a.profilesTotal + b.profilesTotal).toBe(40);
    expect(a.profilesTotal).toBeGreaterThan(0);
    expect(b.profilesTotal).toBeGreaterThan(0);
    expect(a.processed + b.processed).toBe(40);
  });

  it("gives a profile the same shard every time", () => {
    const id = "5de7a384-ea8c-4da4-897a-91303111e34a";
    expect(profileShard(id, 2)).toBe(profileShard(id, 2));
    expect(profileShard("not-a-uuid", 2)).toBeLessThan(2);
  });
});

describe("resume after a partial run", () => {
  it("skips accounts already snapshotted since resumeSince", async () => {
    mocks.existingSnapshots = [{ creatorProfileId: "p1", platform: "twitch" }];

    const result = await runTierSnapshot("tier3", step, {
      resumeSince: new Date("2026-10-26T03:00:00Z"),
    });

    expect(result.resumed).toBe(1);
    expect(result.processed).toBe(1);
    expect(mocks.prisma.metricSnapshot.create).toHaveBeenCalledTimes(1);
  });
});

describe("platforms tier jobs don't poll", () => {
  it("are left out of the counts, and the profile is still refreshed", async () => {
    mocks.profiles = [
      {
        id: "p1",
        platformAccounts: [
          account("a1", "twitch"),
          account("k1", "kick"),
          account("i1", "instagram"),
        ],
      },
      { id: "p2", platformAccounts: [account("k2", "kick")] },
    ];

    const result = await runTierSnapshot("tier3", step);
    const summary = tierRunSummary(result, { runner: "github" });

    expect(result.processed).toBe(1);
    expect(summary.recordsScanned).toBe(1);
    expect(summary.recordsWritten).toBe(1);
    expect(mocks.prisma.metricSnapshot.create).toHaveBeenCalledTimes(1);
    // The Kick-only profile still gets its aggregates and cache refresh.
    expect(mocks.invalidateCreatorCacheOrThrow).toHaveBeenCalledTimes(2);
  });
});

describe("time budget", () => {
  it("stops starting batches and reports the run as degraded", async () => {
    mocks.profiles = Array.from({ length: 120 }, (_, i) => ({
      id: `p${i}`,
      platformAccounts: [account(`a${i}`, "twitch")],
    }));
    let calls = 0;
    const slowStep = {
      ...step,
      run: async (id: string, fn: () => Promise<unknown>) => {
        const out = await fn();
        // The first batch "takes" past the budget.
        if (id.startsWith("snapshot-batch") && calls++ === 0) {
          vi.setSystemTime(Date.now() + 10 * 60_000);
        }
        return out;
      },
    };
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const result = await runTierSnapshot("tier3", slowStep, {
        timeBudgetMs: 60_000,
      });
      expect(result.stoppedByTimeBudget).toBe(true);
      expect(result.profilesReached).toBe(50);

      const summary = tierRunSummary(result, { runner: "github" });
      expect(summary.status).toBe("degraded");
      expect(summary.partialCount).toBe(70);
      expect(summary.metadata).toMatchObject({ runner: "github" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("YouTube accounts", () => {
  it("are looked up in one batched call, missing ids count as not found", async () => {
    mocks.profiles = [
      { id: "p1", platformAccounts: [account("y1", "youtube", "UCaaa")] },
      { id: "p2", platformAccounts: [account("y2", "youtube", "UCbbb")] },
    ];
    mocks.fetchChannelsByIds.mockResolvedValue(
      new Map([
        [
          "UCaaa",
          {
            id: "UCaaa",
            title: "A",
            customUrl: null,
            avatarUrl: null,
            subscriberCount: 500n,
            hiddenSubscriberCount: false,
            viewCount: 9n,
            videoCount: 3,
          },
        ],
      ]),
    );

    const result = await runTierSnapshot("tier3", step);

    expect(mocks.fetchChannelsByIds).toHaveBeenCalledTimes(1);
    expect(mocks.fetchChannelsByIds).toHaveBeenCalledWith(["UCaaa", "UCbbb"]);
    expect(mocks.fetchSnapshot).not.toHaveBeenCalled();
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0); // UCbbb: not found, not a failure
    expect(mocks.prisma.metricSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        creatorProfileId: "p1",
        platform: "youtube",
        followerCount: 500n,
      }),
    });
    expect(mocks.prisma.platformAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "y2" },
        data: expect.objectContaining({ notFoundCount: 1 }),
      }),
    );
  });

  it("fall back to one call per account when the batch lookup fails", async () => {
    mocks.profiles = [
      { id: "p1", platformAccounts: [account("y1", "youtube", "UCaaa")] },
    ];
    mocks.fetchChannelsByIds.mockRejectedValue(new Error("quota"));

    const result = await runTierSnapshot("tier3", step);

    expect(mocks.fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(1);
  });
});

describe("Twitch priority", () => {
  it("polls inside the tier scope", async () => {
    await runTierSnapshot("tier3", step);
    expect(mocks.priorities).toEqual(["tier", "tier"]);
  });
});

describe("profiles polled at once (GitHub)", () => {
  /** Track how many fetchSnapshot calls are in flight, and their order. */
  function trackOverlap() {
    const seen = { inFlight: 0, max: 0, order: [] as string[] };
    mocks.fetchSnapshot.mockImplementation(async (platformUserId: string) => {
      seen.order.push(platformUserId);
      seen.inFlight++;
      seen.max = Math.max(seen.max, seen.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.inFlight--;
      return twitchSnapshot;
    });
    return seen;
  }

  beforeEach(() => {
    mocks.profiles = Array.from({ length: 12 }, (_, i) => ({
      id: `p${String(i).padStart(2, "0")}`,
      platformAccounts: [account(`a${i}`, "twitch", `u${i}`)],
    }));
  });

  it("default (Inngest): one profile after another, in order", async () => {
    const seen = trackOverlap();

    const result = await runTierSnapshot("tier3", step);

    expect(seen.max).toBe(1);
    expect(seen.order).toEqual(
      mocks.profiles.map((p) => p.platformAccounts[0]!.platformUserId),
    );
    expect(result.processed).toBe(12);
  });

  it("profileConcurrency 5: at most 5 at once, every count exact", async () => {
    const seen = trackOverlap();
    mocks.fetchSnapshot.mockImplementationOnce(async () => {
      throw new Error("boom"); // one failure among the overlapping profiles
    });

    const result = await runTierSnapshot("tier3", step, {
      profileConcurrency: 5,
    });

    expect(seen.max).toBe(5);
    expect(result.processed).toBe(11);
    expect(result.errors).toBe(1);
    expect(mocks.prisma.metricSnapshot.create).toHaveBeenCalledTimes(11);
    expect(mocks.invalidateCreatorCacheOrThrow).toHaveBeenCalledTimes(12);
  });

  it("reports where the time went, per run and in the run metadata", async () => {
    trackOverlap();

    const result = await runTierSnapshot("tier3", step, {
      profileConcurrency: 5,
    });

    expect(result.timing).toEqual({
      wallMs: expect.any(Number),
      youtubeMs: expect.any(Number),
      twitchWaitMs: expect.any(Number),
      twitchHttpMs: expect.any(Number),
      dbAndOtherMs: expect.any(Number),
    });
    expect(result.timing.dbAndOtherMs).toBeGreaterThan(0);
    expect(tierRunSummary(result, { runner: "github" }).metadata).toMatchObject(
      { timing: result.timing },
    );
  });
});
