import type { Platform } from "@twitchmetrics/database";
import { prisma } from "@twitchmetrics/database";
import { DAILY_GAME_SNAPSHOT_SOURCE } from "@/server/services/streamhatchet/daily-game-platform";
import { summarizeViewerSeries } from "@/server/services/game-metrics";

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

  const latestByPlatform = new Map<
    Platform,
    {
      viewers: number;
      channels: number | null;
      snapshotAt: Date;
      bucketStartedAt: Date;
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
        bucketStartedAt: snapshot.bucketStartedAt,
        source: snapshot.source,
      });
    }
  }

  if (legacySnapshot && isFresh(legacySnapshot.snapshotAt, "twitch_api")) {
    latestByPlatform.set("twitch", {
      viewers: legacySnapshot.twitchViewers,
      channels: legacySnapshot.twitchChannels,
      snapshotAt: legacySnapshot.snapshotAt,
      bucketStartedAt: legacySnapshot.snapshotAt,
      source: "twitch_api",
    });

    if (legacySnapshot.kickViewers > 0) {
      latestByPlatform.set("kick", {
        viewers: legacySnapshot.kickViewers,
        channels: legacySnapshot.kickChannels,
        snapshotAt: legacySnapshot.snapshotAt,
        bucketStartedAt: legacySnapshot.snapshotAt,
        source: "legacy_game_snapshot",
      });
    }

    if (legacySnapshot.youtubeViewers > 0) {
      latestByPlatform.set("youtube", {
        viewers: legacySnapshot.youtubeViewers,
        channels: legacySnapshot.youtubeChannels,
        snapshotAt: legacySnapshot.snapshotAt,
        bucketStartedAt: legacySnapshot.snapshotAt,
        source: "legacy_game_snapshot",
      });
    }
  }

  const viewerRows: GamePlatformMetricRow[] = [];
  const channelRows: GamePlatformMetricRow[] = [];

  for (const [platform, snapshot] of latestByPlatform) {
    if (!isSnapshotFresh(snapshot)) continue;
    const caption = captionFor(snapshot.source, snapshot.bucketStartedAt);
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

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type GameWindowMetrics = {
  /** 7-day average viewers per platform; the total is their sum. */
  avgViewers: GamePlatformMetricGroup;
  /**
   * 24h peak per platform. No total: the platforms peak at different moments,
   * and adding their peaks would report an audience nobody measured. YouTube
   * has no live feed, so it has no peak.
   */
  peakViewers: GamePlatformMetricGroup;
  /** 7-day average live channels per platform; the total is their sum. */
  avgChannels: GamePlatformMetricGroup;
};

type TwitchWindow = {
  avgViewers: number;
  peakViewers24h: number;
  avgChannels: number;
};

type KickReading = { bucketStartedAt: Date; viewers: number; channels: number };
type YouTubeDay = { bucketStartedAt: Date; viewers: number; channels: number };

function dayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Header numbers for the 7 days ending `until`, per platform (QA 2026-10: the
 * header counted Twitch only, so every game read well under Stream Hatchet's
 * all-platform figure).
 *
 * - Twitch: the page's own 7d series — the same numbers its Twitch charts show.
 * - Kick: hourly Kick API readings, summed across the game's Kick categories
 *   per reading, time-weighted like Twitch. When readings start partway into
 *   the window (a category mapped this week), the row says since when.
 * - YouTube: Stream Hatchet's daily averages for the days in the window,
 *   captioned with those days — they trail live data by a day or two.
 *
 * Pure, so the arithmetic is testable without a database.
 */
export function buildGameWindowMetrics(input: {
  until: Date;
  twitch: TwitchWindow;
  kick: KickReading[];
  youtube: YouTubeDay[];
}): GameWindowMetrics {
  const { until, twitch } = input;
  const avgViewers: GamePlatformMetricRow[] = [
    { platform: "twitch", value: twitch.avgViewers, caption: null },
  ];
  const peakViewers: GamePlatformMetricRow[] = [
    { platform: "twitch", value: twitch.peakViewers24h, caption: null },
  ];
  const avgChannels: GamePlatformMetricRow[] = [
    { platform: "twitch", value: twitch.avgChannels, caption: null },
  ];

  // One point per reading: a game with two Kick categories has two rows per
  // bucket, and its audience is their sum.
  const kickByBucket = new Map<number, { viewers: number; channels: number }>();
  for (const reading of input.kick) {
    const key = reading.bucketStartedAt.getTime();
    const point = kickByBucket.get(key) ?? { viewers: 0, channels: 0 };
    point.viewers += reading.viewers;
    point.channels += reading.channels;
    kickByBucket.set(key, point);
  }
  if (kickByBucket.size > 0) {
    const points = [...kickByBucket.entries()].map(([at, point]) => ({
      snapshotAt: new Date(at),
      ...point,
    }));
    const first = Math.min(...kickByBucket.keys());
    // A day's slack: a reading or two missed at the window's edge is not a
    // shorter window worth flagging.
    const caption =
      first > until.getTime() - WEEK_MS + DAY_MS
        ? `since ${dayLabel(new Date(first))}`
        : null;
    const viewers = summarizeViewerSeries(
      points.map((p) => ({
        snapshotAt: p.snapshotAt,
        totalViewers: p.viewers,
      })),
    );
    const channels = summarizeViewerSeries(
      points.map((p) => ({
        snapshotAt: p.snapshotAt,
        totalViewers: p.channels,
      })),
    );
    const since24h = until.getTime() - DAY_MS;
    const peak24h = points
      .filter((p) => p.snapshotAt.getTime() >= since24h)
      .reduce((peak, p) => Math.max(peak, p.viewers), 0);
    avgViewers.push({ platform: "kick", value: viewers.average, caption });
    avgChannels.push({ platform: "kick", value: channels.average, caption });
    peakViewers.push({ platform: "kick", value: peak24h, caption: null });
  }

  if (input.youtube.length > 0) {
    const days = [...input.youtube].sort(
      (a, b) => a.bucketStartedAt.getTime() - b.bucketStartedAt.getTime(),
    );
    const first = days[0]!.bucketStartedAt;
    const last = days[days.length - 1]!.bucketStartedAt;
    const range =
      first.getTime() === last.getTime()
        ? dayLabel(first)
        : `${dayLabel(first)}–${dayLabel(last)}`;
    const caption = `daily avg · ${range}`;
    const mean = (values: number[]) =>
      Math.floor(values.reduce((sum, v) => sum + v, 0) / values.length);
    avgViewers.push({
      platform: "youtube",
      value: mean(days.map((d) => d.viewers)),
      caption,
    });
    avgChannels.push({
      platform: "youtube",
      value: mean(days.map((d) => d.channels)),
      caption,
    });
  }

  return {
    avgViewers: group(avgViewers),
    peakViewers: group(peakViewers),
    avgChannels: group(avgChannels),
  };
}

export async function getGameWindowMetrics(input: {
  gameId: string;
  until: Date;
  twitch: TwitchWindow;
}): Promise<GameWindowMetrics> {
  const since = new Date(input.until.getTime() - WEEK_MS);
  const [kick, youtube] = await Promise.all([
    prisma.gamePlatformViewerSnapshot.findMany({
      where: {
        gameId: input.gameId,
        platform: "kick",
        source: "kick_api",
        bucketStartedAt: { gt: since, lte: input.until },
      },
      select: { bucketStartedAt: true, viewers: true, channels: true },
    }),
    prisma.gamePlatformViewerSnapshot.findMany({
      where: {
        gameId: input.gameId,
        platform: "youtube",
        source: DAILY_GAME_SNAPSHOT_SOURCE,
        // Whole days inside the window: the day `since` falls in is only
        // partly covered, so it starts at the next midnight.
        bucketStartedAt: {
          gte: new Date(Math.ceil(since.getTime() / DAY_MS) * DAY_MS),
          lte: input.until,
        },
      },
      select: { bucketStartedAt: true, viewers: true, channels: true },
    }),
  ]);

  return buildGameWindowMetrics({
    until: input.until,
    twitch: input.twitch,
    kick: kick.map((row) => ({ ...row, channels: row.channels ?? 0 })),
    youtube: youtube.map((row) => ({ ...row, channels: row.channels ?? 0 })),
  });
}
