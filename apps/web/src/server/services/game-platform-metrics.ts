import type { Platform } from "@twitchmetrics/database";
import { prisma } from "@twitchmetrics/database";
import { createLogger } from "@/lib/logger";
import { getLastCompleteStatsDay } from "@/server/services/creator-streaming-stats";
import { summarizeViewerSeries } from "@/server/services/game-metrics";
import { completeDayWindow } from "@/server/services/streaming-stats";
import {
  DAILY_GAME_SNAPSHOT_SOURCE,
  MINUTES_PER_DAY,
} from "@/server/services/streamhatchet/daily-game-platform";
import { streamHatchetNamesForGame } from "@/server/services/streamhatchet/game-names";

const log = createLogger("game-platform-metrics");

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

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type GameWindowMetrics = {
  /** 7-day average viewers per platform; the total is their sum. */
  avgViewers: GamePlatformMetricGroup;
  /**
   * 24h peak per platform. No total: the platforms peak at different moments,
   * and adding their peaks would report an audience nobody measured.
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
/** One hourly Stream Hatchet reading, for the 24h peak. */
type LiveReading = {
  platform: Platform;
  bucketStartedAt: Date;
  viewers: number;
};

const WINDOW_DAYS = 7;
/** The most channels our Kick reading returns for one Kick category. */
const KICK_CHANNELS_PER_CATEGORY = 100;

/** Stream Hatchet's 7-day average viewers per platform, for named days. */
export type DailyViewerAverages = {
  viewers: Partial<Record<"twitch" | "kick" | "youtube", number>>;
  /** Says which days: these trail live readings by a day or two. */
  caption: string;
};

function dayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function dayRangeLabel(first: Date, last: Date): string {
  return first.getTime() === last.getTime()
    ? dayLabel(first)
    : `${dayLabel(first)}–${dayLabel(last)}`;
}

/**
 * 7-day average viewers per platform from Stream Hatchet's daily totals: all
 * minutes watched over all the minutes in the window. A day with no row for a
 * platform counts as nobody watching, so the window stays a whole 7 days.
 * A platform with no rows at all is left out, so its caller can fall back.
 */
export function dailyViewerAverages(
  rollups: { platform: string; minutesWatched: bigint | number }[],
  days: number,
): DailyViewerAverages["viewers"] {
  const minutes = new Map<"twitch" | "kick" | "youtube", number>();
  for (const rollup of rollups) {
    const platform =
      rollup.platform === "yt" || rollup.platform === "ytg"
        ? "youtube"
        : rollup.platform === "twitch" || rollup.platform === "kick"
          ? rollup.platform
          : null;
    if (!platform) continue;
    minutes.set(
      platform,
      (minutes.get(platform) ?? 0) + Number(rollup.minutesWatched),
    );
  }
  return Object.fromEntries(
    [...minutes].map(([platform, total]) => [
      platform,
      Math.round(total / (MINUTES_PER_DAY * days)),
    ]),
  );
}

/**
 * Header numbers for the 7 days ending `until`, per platform (QA 2026-10: the
 * header counted Twitch only, so every game read well under Stream Hatchet's
 * all-platform figure).
 *
 * Average viewers come from Stream Hatchet's daily totals whenever it has the
 * platform (`daily`, SH's QA 2026-11: their data first). Everything else, and
 * any platform SH has nothing for, comes from:
 *
 * - Twitch: the page's own 7d series — the same numbers its Twitch charts show.
 * - Kick: hourly Kick API readings, summed across the game's Kick categories
 *   per reading, time-weighted like Twitch. When readings start partway into
 *   the window (a category mapped this week), the row says since when.
 * - YouTube: Stream Hatchet's daily averages for the days in the window,
 *   captioned with those days — they trail live data by a day or two.
 *
 * Average channels stay on these readings: SH's daily feed leaves out small
 * channels, so its totals read several times under the channels actually live.
 * Kick's reading stops at the top 100 channels per category, so a row at that
 * limit says it counts top channels only.
 *
 * The 24h peak is the highest reading from any source: our readings plus SH's
 * hourly live ones (`live`), which only the biggest games have.
 *
 * Pure, so the arithmetic is testable without a database.
 */
export function buildGameWindowMetrics(input: {
  until: Date;
  twitch: TwitchWindow;
  kick: KickReading[];
  youtube: YouTubeDay[];
  daily?: DailyViewerAverages | null;
  live?: LiveReading[];
}): GameWindowMetrics {
  const { until, twitch, daily } = input;
  const since24h = until.getTime() - DAY_MS;
  const livePeak = new Map<Platform, number>();
  for (const reading of input.live ?? []) {
    if (reading.bucketStartedAt.getTime() < since24h) continue;
    livePeak.set(
      reading.platform,
      Math.max(livePeak.get(reading.platform) ?? 0, reading.viewers),
    );
  }
  const peakRow = (
    platform: Platform,
    reading: number,
  ): GamePlatformMetricRow => ({
    platform,
    value: Math.max(reading, livePeak.get(platform) ?? 0),
    caption: null,
  });
  const averageRow = (
    platform: "twitch" | "kick" | "youtube",
    reading: number,
    readingCaption: string | null,
  ): GamePlatformMetricRow => {
    const fromDaily = daily?.viewers[platform];
    return fromDaily === undefined
      ? { platform, value: reading, caption: readingCaption }
      : { platform, value: fromDaily, caption: daily?.caption ?? null };
  };
  const avgViewers: GamePlatformMetricRow[] = [
    averageRow("twitch", twitch.avgViewers, null),
  ];
  const peakViewers: GamePlatformMetricRow[] = [
    peakRow("twitch", twitch.peakViewers24h),
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
    const peak24h = points
      .filter((p) => p.snapshotAt.getTime() >= since24h)
      .reduce((peak, p) => Math.max(peak, p.viewers), 0);
    avgViewers.push(averageRow("kick", viewers.average, caption));
    avgChannels.push({
      platform: "kick",
      value: channels.average,
      caption:
        channels.peak >= KICK_CHANNELS_PER_CATEGORY
          ? "top channels only"
          : caption,
    });
    peakViewers.push(peakRow("kick", peak24h));
  } else {
    if (daily?.viewers.kick !== undefined) {
      avgViewers.push(averageRow("kick", 0, null));
    }
    if (livePeak.has("kick")) peakViewers.push(peakRow("kick", 0));
  }
  if (livePeak.has("youtube")) peakViewers.push(peakRow("youtube", 0));

  if (input.youtube.length > 0) {
    const days = [...input.youtube].sort(
      (a, b) => a.bucketStartedAt.getTime() - b.bucketStartedAt.getTime(),
    );
    const first = days[0]!.bucketStartedAt;
    const last = days[days.length - 1]!.bucketStartedAt;
    const caption = `daily avg · ${dayRangeLabel(first, last)}`;
    const mean = (values: number[]) =>
      Math.floor(values.reduce((sum, v) => sum + v, 0) / values.length);
    avgViewers.push(
      averageRow("youtube", mean(days.map((d) => d.viewers)), caption),
    );
    avgChannels.push({
      platform: "youtube",
      value: mean(days.map((d) => d.channels)),
      caption,
    });
  } else if (daily?.viewers.youtube !== undefined) {
    avgViewers.push(averageRow("youtube", 0, null));
  }

  return {
    avgViewers: group(avgViewers),
    peakViewers: group(peakViewers),
    avgChannels: group(avgChannels),
  };
}

/** The last 7 complete days of a game's Stream Hatchet totals, every spelling. */
async function getDailyViewerAverages(
  gameId: string,
): Promise<DailyViewerAverages> {
  const window = completeDayWindow(
    WINDOW_DAYS,
    await getLastCompleteStatsDay(),
  );
  const names = await streamHatchetNamesForGame(prisma, gameId, window.start);
  const rollups = await prisma.gameDailyRollup.findMany({
    where: {
      source: "streamhatchet",
      date: { gte: window.start, lte: window.lastDay },
      OR: [
        { platform: { in: ["twitch", "kick"] }, gameName: { in: names.all } },
        { platform: { in: ["yt", "ytg"] }, gameName: { in: names.youtube } },
      ],
    },
    select: { platform: true, minutesWatched: true },
  });
  return {
    viewers: dailyViewerAverages(rollups, WINDOW_DAYS),
    caption: `daily avg · ${dayRangeLabel(window.start, window.lastDay)}`,
  };
}

export async function getGameWindowMetrics(input: {
  gameId: string;
  until: Date;
  twitch: TwitchWindow;
}): Promise<GameWindowMetrics> {
  const since = new Date(input.until.getTime() - WEEK_MS);
  const [daily, live, kick, youtube] = await Promise.all([
    // One figure's source: if it fails, the header shows our readings.
    getDailyViewerAverages(input.gameId).catch((err: unknown) => {
      log.warn({ err, gameId: input.gameId }, "daily viewer averages failed");
      return null;
    }),
    prisma.gamePlatformViewerSnapshot.findMany({
      where: {
        gameId: input.gameId,
        source: "streamhatchet_live",
        bucketStartedAt: { gte: new Date(input.until.getTime() - DAY_MS) },
      },
      select: { platform: true, bucketStartedAt: true, viewers: true },
    }),
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
    daily,
    live,
  });
}
