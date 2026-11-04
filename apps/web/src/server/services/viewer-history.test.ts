import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@twitchmetrics/database";
import { getViewerHistory } from "./viewer-history";

type Rollup = {
  date: Date;
  averageViewers: number | null;
  peakViewers: number | null;
  primaryGameName: string | null;
};
type Snapshot = { snapshotAt: Date; extendedMetrics: unknown };

function fakePrisma(data: {
  accounts?: { platform: string; platformUserId: string }[];
  rollups?: Rollup[];
  snapshots?: Snapshot[];
}) {
  const snapshots = data.snapshots ?? [];
  const prisma = {
    platformAccount: {
      findMany: vi.fn(async () =>
        (data.accounts ?? []).map((account) => ({
          ...account,
          platformUsername: account.platformUserId,
        })),
      ),
    },
    channelDailyRollup: { findMany: vi.fn(async () => data.rollups ?? []) },
    metricSnapshot: {
      findFirst: vi.fn(async () => snapshots[snapshots.length - 1] ?? null),
      findMany: vi.fn(async () => snapshots),
    },
  };
  return { prisma, client: prisma as unknown as PrismaClient };
}

const input = {
  creatorProfileId: "creator-1",
  platform: "twitch" as const,
  period: "30d" as const,
};
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("getViewerHistory", () => {
  it("plots Stream Hatchet's daily figures over our live readings", async () => {
    const { prisma, client } = fakePrisma({
      accounts: [{ platform: "twitch", platformUserId: "tw-1" }],
      rollups: [
        {
          date: day("2026-10-14"),
          averageViewers: 64867.4,
          peakViewers: 127045,
          primaryGameName: "Just Chatting",
        },
      ],
      snapshots: [
        {
          snapshotAt: new Date("2026-10-14T20:00:00Z"),
          extendedMetrics: { LIVE_VIEWER_COUNT: 108786 },
        },
      ],
    });

    const history = await getViewerHistory(client, input);

    expect(history.source).toBe("streamhatchet_rollups");
    expect(history.points).toEqual([
      {
        date: "2026-10-14T00:00:00.000Z",
        viewers: 64867,
        peak: 127045,
        game: "Just Chatting",
      },
    ]);
    // The snapshot series is only loaded when there is no SH data.
    expect(prisma.metricSnapshot.findMany).not.toHaveBeenCalled();
    expect(history.latestAt).toBe("2026-10-14T20:00:00.000Z");
  });

  it("keeps the larger of a day's yt and ytg rows", async () => {
    const { client } = fakePrisma({
      accounts: [{ platform: "youtube", platformUserId: "yt-1" }],
      rollups: [
        {
          date: day("2026-10-20"),
          averageViewers: 300,
          peakViewers: 900,
          primaryGameName: "Minecraft",
        },
        {
          date: day("2026-10-20"),
          averageViewers: 120,
          peakViewers: 1500,
          primaryGameName: null,
        },
      ],
    });

    const history = await getViewerHistory(client, {
      ...input,
      platform: "youtube",
    });

    expect(history.points).toEqual([
      {
        date: "2026-10-20T00:00:00.000Z",
        viewers: 300,
        peak: 1500,
        game: "Minecraft",
      },
    ]);
  });

  it("falls back to our live readings when Stream Hatchet has nothing", async () => {
    const { client } = fakePrisma({
      accounts: [{ platform: "twitch", platformUserId: "tw-1" }],
      snapshots: [
        {
          snapshotAt: new Date("2026-10-20T12:00:00Z"),
          extendedMetrics: { LIVE_VIEWER_COUNT: 950, CURRENT_GAME: "Tibia" },
        },
        {
          snapshotAt: new Date("2026-10-21T12:00:00Z"),
          extendedMetrics: { IS_LIVE: false },
        },
      ],
    });

    const history = await getViewerHistory(client, input);

    expect(history.source).toBe("snapshots");
    expect(history.points).toEqual([
      { date: "2026-10-20T12:00:00.000Z", viewers: 950, game: "Tibia" },
    ]);
  });

  it("skips Stream Hatchet for platforms it doesn't cover", async () => {
    const { prisma, client } = fakePrisma({});

    await getViewerHistory(client, { ...input, platform: "instagram" });

    expect(prisma.platformAccount.findMany).not.toHaveBeenCalled();
    expect(prisma.channelDailyRollup.findMany).not.toHaveBeenCalled();
  });

  it("shows the live badge from a fresh reading alongside SH data", async () => {
    const { client } = fakePrisma({
      accounts: [{ platform: "twitch", platformUserId: "tw-1" }],
      rollups: [
        {
          date: day("2026-10-14"),
          averageViewers: 5000,
          peakViewers: 8000,
          primaryGameName: null,
        },
      ],
      snapshots: [
        {
          snapshotAt: new Date(Date.now() - 5 * 60 * 1000),
          extendedMetrics: { IS_LIVE: true, LIVE_VIEWER_COUNT: 7100 },
        },
      ],
    });

    const history = await getViewerHistory(client, input);

    expect(history.liveInfo).toEqual({ viewers: 7100 });
  });
});
