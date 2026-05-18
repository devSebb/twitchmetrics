import type { Platform } from "@twitchmetrics/database";
import { prisma } from "@twitchmetrics/database";

const CURRENT_SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const PLATFORM_ORDER: Platform[] = [
  "twitch",
  "kick",
  "youtube",
  "instagram",
  "tiktok",
  "x",
];

export type GamePlatformMetricRow = {
  platform: Platform;
  value: number;
};

export type GamePlatformMetricGroup = {
  rows: GamePlatformMetricRow[];
  total: number;
};

export type GamePlatformMetrics = {
  liveViewers: GamePlatformMetricGroup;
  liveChannels: GamePlatformMetricGroup;
};

function sortRows(rows: GamePlatformMetricRow[]): GamePlatformMetricRow[] {
  return [...rows].sort(
    (left, right) =>
      PLATFORM_ORDER.indexOf(left.platform) -
      PLATFORM_ORDER.indexOf(right.platform),
  );
}

function isFresh(date: Date | null | undefined, now = Date.now()): boolean {
  return Boolean(
    date &&
    now - date.getTime() >= 0 &&
    now - date.getTime() <= CURRENT_SNAPSHOT_MAX_AGE_MS,
  );
}

function group(rows: GamePlatformMetricRow[]): GamePlatformMetricGroup {
  const sorted = sortRows(rows.filter((row) => row.value > 0));
  return {
    rows: sorted,
    total: sorted.reduce((sum, row) => sum + row.value, 0),
  };
}

function sourcePriority(source: string): number {
  switch (source) {
    case "twitch_api":
    case "kick_api":
      return 100;
    case "streamhatchet_live":
      return 80;
    case "api":
      return 50;
    default:
      return 10;
  }
}

export async function getGamePlatformMetrics(input: {
  gameId: string;
  fallbackTwitchViewers: number;
  fallbackTwitchChannels: number;
}): Promise<GamePlatformMetrics> {
  const [legacySnapshot, platformSnapshots] = await Promise.all([
    prisma.gameViewerSnapshot.findFirst({
      where: { gameId: input.gameId },
      orderBy: { snapshotAt: "desc" },
      select: {
        snapshotAt: true,
        twitchViewers: true,
        twitchChannels: true,
        youtubeViewers: true,
        youtubeChannels: true,
        kickViewers: true,
        kickChannels: true,
      },
    }),
    prisma.gamePlatformViewerSnapshot.findMany({
      where: {
        gameId: input.gameId,
        snapshotAt: {
          gte: new Date(Date.now() - CURRENT_SNAPSHOT_MAX_AGE_MS),
        },
      },
      orderBy: { snapshotAt: "desc" },
      select: {
        platform: true,
        snapshotAt: true,
        viewers: true,
        channels: true,
        source: true,
      },
    }),
  ]);

  const latestByPlatform = new Map<
    Platform,
    {
      viewers: number;
      channels: number | null;
      snapshotAt: Date;
      source: string;
    }
  >();

  for (const snapshot of platformSnapshots) {
    const existing = latestByPlatform.get(snapshot.platform);
    const shouldReplace =
      !existing ||
      sourcePriority(snapshot.source) > sourcePriority(existing.source) ||
      (sourcePriority(snapshot.source) === sourcePriority(existing.source) &&
        snapshot.snapshotAt > existing.snapshotAt);

    if (shouldReplace) {
      latestByPlatform.set(snapshot.platform, {
        viewers: snapshot.viewers,
        channels: snapshot.channels,
        snapshotAt: snapshot.snapshotAt,
        source: snapshot.source,
      });
    }
  }

  if (legacySnapshot && isFresh(legacySnapshot.snapshotAt)) {
    latestByPlatform.set("twitch", {
      viewers: legacySnapshot.twitchViewers,
      channels: legacySnapshot.twitchChannels,
      snapshotAt: legacySnapshot.snapshotAt,
      source: "twitch_api",
    });

    if (legacySnapshot.kickViewers > 0) {
      latestByPlatform.set("kick", {
        viewers: legacySnapshot.kickViewers,
        channels: legacySnapshot.kickChannels,
        snapshotAt: legacySnapshot.snapshotAt,
        source: "legacy_game_snapshot",
      });
    }

    if (legacySnapshot.youtubeViewers > 0) {
      latestByPlatform.set("youtube", {
        viewers: legacySnapshot.youtubeViewers,
        channels: legacySnapshot.youtubeChannels,
        snapshotAt: legacySnapshot.snapshotAt,
        source: "legacy_game_snapshot",
      });
    }
  } else if (
    input.fallbackTwitchViewers > 0 ||
    input.fallbackTwitchChannels > 0
  ) {
    latestByPlatform.set("twitch", {
      viewers: input.fallbackTwitchViewers,
      channels: input.fallbackTwitchChannels,
      snapshotAt: new Date(),
      source: "game_fallback",
    });
  }

  const viewerRows: GamePlatformMetricRow[] = [];
  const channelRows: GamePlatformMetricRow[] = [];

  for (const [platform, snapshot] of latestByPlatform) {
    if (!isFresh(snapshot.snapshotAt)) continue;
    viewerRows.push({ platform, value: snapshot.viewers });
    if (snapshot.channels !== null) {
      channelRows.push({ platform, value: snapshot.channels });
    }
  }

  return {
    liveViewers: group(viewerRows),
    liveChannels: group(channelRows),
  };
}
