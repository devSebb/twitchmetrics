import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The tier snapshot loop's handling of deleted/banned channels: a not-found
 * account must be counted (not failed), and dropped from the rotation after
 * NOT_FOUND_SKIP_THRESHOLD strikes. The loop itself is not exported, so this
 * drives it through runTierSnapshot with a mocked adapter and db.
 */

const { prisma, getAdapter, fetchSnapshot } = vi.hoisted(() => {
  const fetchSnapshot = vi.fn();
  return {
    fetchSnapshot,
    getAdapter: vi.fn(() => ({ fetchSnapshot })),
    prisma: {
      creatorProfile: {
        // Typed args: an untyped vi.fn() has an empty call tuple, so
        // reading mock.calls[n][0] below would not typecheck.
        findMany: vi.fn(
          async (_args: { select?: Record<string, unknown> }) =>
            [] as unknown[],
        ),
        update: vi.fn(async (_args: unknown) => ({})),
        // getCreatorSlug (cache invalidation) — keeps the run log clean.
        findUnique: vi.fn(async (_args: unknown) => ({ slug: "creator-1" })),
      },
      platformAccount: {
        update: vi.fn(
          async (_args: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => ({}),
        ),
      },
      metricSnapshot: { create: vi.fn(async (_args: unknown) => ({})) },
    },
  };
});

vi.mock("@twitchmetrics/database", async () => {
  const actual = await vi.importActual<
    typeof import("@twitchmetrics/database")
  >("@twitchmetrics/database");
  return { ...actual, prisma };
});
vi.mock("@/server/adapters", () => ({ getAdapter }));
vi.mock("@/server/services/cache", () => ({ cacheInvalidate: vi.fn() }));
vi.mock("@/server/services/creator-cache", () => ({
  invalidateCreatorCache: vi.fn(),
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

import { AdapterError } from "@/server/adapters/types";
import { runTierSnapshot } from "./shared";

const step = {
  run: async (_id: string, fn: () => Promise<unknown>) => fn(),
  sleep: async () => undefined,
};

const account = {
  id: "account-1",
  platform: "twitch" as const,
  platformUserId: "999",
  isOAuthConnected: false,
  accessToken: null,
  notFoundCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.creatorProfile.findMany.mockImplementation(
    async (args: { select?: Record<string, unknown> }) =>
      args.select &&
      "id" in args.select &&
      Object.keys(args.select).length === 1
        ? [{ id: "profile-1" }]
        : [
            {
              id: "profile-1",
              totalFollowers: 0n,
              snapshotTier: "tier3",
              platformAccounts: [account],
            },
          ],
  );
});

describe("deleted/banned channels", () => {
  it("counts a not-found account instead of failing the run", async () => {
    fetchSnapshot.mockRejectedValue(
      new AdapterError("twitch", "not_found", "User ID '999' not found"),
    );

    const result = await runTierSnapshot("tier3", step);

    expect(result.errors).toBe(0);
    expect(result.processed).toBe(0);
    expect(prisma.platformAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "account-1" },
        data: expect.objectContaining({ notFoundCount: 1 }),
      }),
    );
  });

  it("still reports other adapter failures as errors", async () => {
    fetchSnapshot.mockRejectedValue(
      new AdapterError("twitch", "rate_limited", "429", true),
    );

    const result = await runTierSnapshot("tier3", step);

    expect(result.errors).toBe(1);
    const notFoundWrites = prisma.platformAccount.update.mock.calls.filter(
      ([args]) => "notFoundCount" in args.data,
    );
    expect(notFoundWrites).toHaveLength(0);
  });

  it("only polls accounts under the strike threshold", async () => {
    fetchSnapshot.mockResolvedValue({
      snapshotAt: new Date(),
      followerCount: 1n,
      followingCount: null,
      totalViews: null,
      subscriberCount: null,
      postCount: null,
      extendedMetrics: {},
    });

    await runTierSnapshot("tier3", step);

    const batchCall = prisma.creatorProfile.findMany.mock.calls.find(
      ([args]) => args.select?.platformAccounts,
    );
    const accountsSelect = (
      batchCall?.[0].select as {
        platformAccounts: { where: Record<string, unknown> };
      }
    ).platformAccounts.where;
    expect(accountsSelect).toMatchObject({
      discoverySource: null,
      notFoundCount: { lt: 3 },
    });
  });
});
