import type { Platform } from "@twitchmetrics/database";
import { prisma } from "@twitchmetrics/database";
import { DAILY_GAME_SNAPSHOT_SOURCE } from "@/server/services/streamhatchet/daily-game-platform";

const CURRENT_SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * Stream Hatchet's daily rollups (C23) are a day's average, published once the
 * export lands the following morning, so a two-hour window would never show
 * them. 48 h keeps yesterday's figure visible all of today and drops it as soon
 * as it is two days stale.
 */
const DAILY_SNAPSHOT_MAX_AGE_MS = 48 * 60 * 60 * 1000;

function maxAgeMsForSource(source: string): number {
  return source === DAILY_GAME_SNAPSHOT_SOURCE
    ? DAILY_SNAPSHOT_MAX_AGE_MS
    : CURRENT_SNAPSHOT_MAX_AGE_MS;
}

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
  /**
   * Set only when the figure is not a live reading, so the card can say so.
   * Computed here rather than in the component: the UI should not have to know
   * which source names mean "daily average".
   */
  caption: string | null;
};

export type GamePlatformMetricGroup = {
  rows: GamePlatformMetricRow[];
  total: number;
};

export type GamePlatformMetrics = {
  latestViewers: GamePlatformMetricGroup;
  latestChannels: GamePlatformMetricGroup;
};

function sortRows(rows: GamePlatformMetricRow[]): GamePlatformMetricRow[] {
  return [...rows].sort(
    (left, right) =>
      PLATFORM_ORDER.indexOf(left.platform) -
      PLATFORM_ORDER.indexOf(right.platform),
  );
}

function isFresh(
  date: Date | null | undefined,
  source = "api",
  now = Date.now(),
): boolean {
  return Boolean(
    date &&
    now - date.getTime() >= 0 &&
    now - date.getTime() <= maxAgeMsForSource(source),
  );
}

export type SnapshotChoice = { source: string; snapshotAt: Date };

/**
 * Which of two snapshots for the same platform to show: the better source
 * always wins, and only within one source does recency decide. That ordering
 * is what keeps a YouTube daily average (C23) from ever hiding a live reading.
 */
export function preferSnapshot(
  candidate: SnapshotChoice,
  existing: SnapshotChoice | undefined,
): boolean {
  if (!existing) return true;
  const candidateRank = sourcePriority(candidate.source);
  const existingRank = sourcePriority(existing.source);
  if (candidateRank !== existingRank) return candidateRank > existingRank;
  return candidate.snapshotAt > existing.snapshotAt;
}

/** "daily avg · 2026-09-20" for a rollup-derived figure, nothing for a live one. */
export function captionFor(source: string, snapshotAt: Date): string | null {
  if (source !== DAILY_GAME_SNAPSHOT_SOURCE) return null;
  return `daily avg · ${snapshotAt.toISOString().slice(0, 10)}`;
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
    // A day's average is better than an empty YouTube column, and worse than
    // any live reading — every live source above outranks it.
    case DAILY_GAME_SNAPSHOT_SOURCE:
      return 30;
    default:
      return 10;
  }
}

export async function getGamePlatformMetrics(input: {
  gameId: string;
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
        // Widest window any source allows; each row is then held to its own
        // limit by isFresh, so a stale live row cannot ride in on the 48 h.
        snapshotAt: {
          gte: new Date(Date.now() - DAILY_SNAPSHOT_MAX_AGE_MS),
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
    if (preferSnapshot(snapshot, existing)) {
      latestByPlatform.set(snapshot.platform, {
        viewers: snapshot.viewers,
        channels: snapshot.channels,
        snapshotAt: snapshot.snapshotAt,
        source: snapshot.source,
      });
    }
  }

  if (legacySnapshot && isFresh(legacySnapshot.snapshotAt, "twitch_api")) {
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
  }

  const viewerRows: GamePlatformMetricRow[] = [];
  const channelRows: GamePlatformMetricRow[] = [];

  for (const [platform, snapshot] of latestByPlatform) {
    if (!isFresh(snapshot.snapshotAt, snapshot.source)) continue;
    const caption = captionFor(snapshot.source, snapshot.snapshotAt);
    viewerRows.push({ platform, value: snapshot.viewers, caption });
    if (snapshot.channels !== null) {
      channelRows.push({ platform, value: snapshot.channels, caption });
    }
  }

  return {
    latestViewers: group(viewerRows),
    latestChannels: group(channelRows),
  };
}
