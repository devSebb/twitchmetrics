import type { Platform } from "@twitchmetrics/database";
import { prisma } from "@twitchmetrics/database";
import { DAILY_GAME_SNAPSHOT_SOURCE } from "@/server/services/streamhatchet/daily-game-platform";

const CURRENT_SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * A daily average is judged by the DAY IT COVERS, not when we computed it, so a
 * backfill of an old date cannot present April's figures as current.
 *
 * That day is already over when the row is written: day D's export lands at
 * D+1 08:10 UTC, making it 32 h old on arrival. 72 h leaves it valid until
 * D+3 00:00 — comfortably past the next morning's import, where 48 h would
 * have blanked the YouTube column every night between 00:00 and 08:10.
 */
const DAILY_SNAPSHOT_MAX_AGE_MS = 72 * 60 * 60 * 1000;

function isDailyAverage(source: string): boolean {
  return source === DAILY_GAME_SNAPSHOT_SOURCE;
}

function maxAgeMsForSource(source: string): number {
  return isDailyAverage(source)
    ? DAILY_SNAPSHOT_MAX_AGE_MS
    : CURRENT_SNAPSHOT_MAX_AGE_MS;
}

/** The timestamp a source's freshness is measured from. */
function effectiveDateFor(snapshot: SnapshotTiming): Date {
  return isDailyAverage(snapshot.source)
    ? snapshot.bucketStartedAt
    : snapshot.snapshotAt;
}

export type SnapshotTiming = {
  source: string;
  snapshotAt: Date;
  bucketStartedAt: Date;
};

/**
 * Whether a snapshot is still worth showing. Live sources get two hours from
 * when they were read; a daily average gets 72 h from the day it covers.
 */
export function isSnapshotFresh(
  snapshot: SnapshotTiming,
  now = Date.now(),
): boolean {
  return isFresh(effectiveDateFor(snapshot), snapshot.source, now);
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

/**
 * "daily avg · Sep 20" for a rollup-derived figure, nothing for a live one —
 * the same short form as the 7d card's YouTube range, and short enough not to
 * be cut off in the card.
 */
export function captionFor(
  source: string,
  bucketStartedAt: Date,
): string | null {
  if (!isDailyAverage(source)) return null;
  return `daily avg · ${dayLabel(bucketStartedAt)}`;
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
    // Stream Hatchet's data first (their QA, 2026-11), and it holds up: at the
    // same hour its viewers match the APIs' within a few percent, and it sees
    // every channel, where ours stop at Twitch's top 5,000 streams and Kick's
    // top 100 per category. Only the biggest games have it.
    case "streamhatchet_live":
      return 110;
    case "twitch_api":
    case "kick_api":
      return 100;
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

type PlatformReading = SnapshotTiming & {
  platform: Platform;
  viewers: number;
  channels: number | null;
};

/**
 * The reading to show per platform: the best source among those still fresh.
 * Freshness comes first, or an old reading from a better source would blank
 * the row although a current one exists (a game that just left SH's top games).
 */
export function latestReadings(
  readings: PlatformReading[],
  now = Date.now(),
): Map<Platform, PlatformReading> {
  const latest = new Map<Platform, PlatformReading>();
  for (const reading of readings) {
    if (!isSnapshotFresh(reading, now)) continue;
    if (preferSnapshot(reading, latest.get(reading.platform))) {
      latest.set(reading.platform, reading);
    }
  }
  return latest;
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
        // Widest window any source allows, measured on the day covered so a
        // daily average written today for an old date is excluded here rather
        // than relying on isFresh alone. Each row is still held to its own
        // limit below, so a stale live row cannot ride in on the 72 h.
        bucketStartedAt: {
          gte: new Date(Date.now() - DAILY_SNAPSHOT_MAX_AGE_MS),
        },
      },
      orderBy: { snapshotAt: "desc" },
      select: {
        platform: true,
        snapshotAt: true,
        bucketStartedAt: true,
        viewers: true,
        channels: true,
        source: true,
      },
    }),
  ]);

  const readings: PlatformReading[] = [...platformSnapshots];
  if (legacySnapshot) {
    const { snapshotAt } = legacySnapshot;
    const legacy = (
      platform: Platform,
      source: string,
      viewers: number,
      channels: number,
    ) =>
      readings.push({
        platform,
        source,
        snapshotAt,
        bucketStartedAt: snapshotAt,
        viewers,
        channels,
      });
    legacy(
      "twitch",
      "twitch_api",
      legacySnapshot.twitchViewers,
      legacySnapshot.twitchChannels,
    );
    if (legacySnapshot.kickViewers > 0) {
      legacy(
        "kick",
        "legacy_game_snapshot",
        legacySnapshot.kickViewers,
        legacySnapshot.kickChannels,
      );
    }
    if (legacySnapshot.youtubeViewers > 0) {
      legacy(
        "youtube",
        "legacy_game_snapshot",
        legacySnapshot.youtubeViewers,
        legacySnapshot.youtubeChannels,
      );
    }
  }

  const viewerRows: GamePlatformMetricRow[] = [];
  const channelRows: GamePlatformMetricRow[] = [];

  for (const [platform, reading] of latestReadings(readings)) {
    const caption = captionFor(reading.source, reading.bucketStartedAt);
    viewerRows.push({ platform, value: reading.viewers, caption });
    if (reading.channels !== null) {
      channelRows.push({ platform, value: reading.channels, caption });
    }
  }

  return {
    latestViewers: group(viewerRows),
    latestChannels: group(channelRows),
  };
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "since Nov 24", for a figure whose readings start partway into its window. */
export function captionSince(first: Date): string {
  return `since ${dayLabel(first)}`;
}
