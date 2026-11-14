import {
  prisma,
  type Platform,
  type PrismaClient,
} from "@twitchmetrics/database";
import { pickStatsPeriod, type StatsContext } from "@/lib/stats-period";
import {
  getStreamHatchetAccounts,
  streamHatchetRollupIdentityWhere,
} from "@/server/services/streamhatchet-identity";
import { fetchVideos } from "@/server/adapters/twitch";
import {
  aggregateCreatorRollups,
  aggregateShRollups,
  averageSessionAirtime,
  clipVodsToWindow,
  combineViewerStats,
  completeDayWindow,
  viewerMetricsFromExtended,
  type CreatorRollupDay,
  type SessionSpan,
  type ShRollupTotals,
  type StatsWindow,
} from "@/server/services/streaming-stats";
import { internalPlatformForStreamHatchet } from "@/server/adapters/streamhatchet";

export type StreamingStats = {
  airTimeSeconds: number | null;
  avgAirTimeSeconds: number | null;
  peakViewers: number | null;
  avgViewers: number | null;
};

const EMPTY_STATS: StreamingStats = {
  airTimeSeconds: null,
  avgAirTimeSeconds: null,
  peakViewers: null,
  avgViewers: null,
};

export function emptyStreamingStats(): StreamingStats {
  return { ...EMPTY_STATS };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_DAY_TTL_MS = 10 * 60 * 1000;
let lastDayCache: { day: Date; fetchedAt: number } | null = null;

/**
 * The newest day creator stats can count as complete: the newest
 * CreatorDailyRollup date. The daily GitHub job writes those last, after all
 * three platforms' files for the day have landed, so the day before has
 * everything SH will send for it. Never later than yesterday; two days ago
 * when there are no rollups at all.
 */
export async function getLastCompleteStatsDay(
  now: Date = new Date(),
): Promise<Date> {
  if (
    lastDayCache &&
    now.getTime() - lastDayCache.fetchedAt < LAST_DAY_TTL_MS
  ) {
    return lastDayCache.day;
  }
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - DAY_MS);
  const newest = await prisma.creatorDailyRollup.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const day = newest
    ? new Date(Math.min(newest.date.getTime(), yesterday.getTime()))
    : new Date(today.getTime() - 2 * DAY_MS);
  lastDayCache = { day, fetchedAt: now.getTime() };
  return day;
}

/** The N complete days creator stats cover, ending on the newest complete day. */
export async function getStatsWindow(days: number): Promise<StatsWindow> {
  return completeDayWindow(days, await getLastCompleteStatsDay());
}

/**
 * How far before the window a stream can have started and still touch it:
 * 24/7 YouTube streams reach ~26 days in one fact. Bounds the index scan on
 * (creatorProfileId, platform, partitionDate).
 */
const SESSION_LOOKBACK_DAYS = 60;

/**
 * Every Stream Hatchet session that overlaps the window, per creator, for
 * Avg Airtime (averageSessionAirtime): BI averages whole streams, so a
 * stream that began before the window or crosses midnight is one session.
 */
export async function loadSessionSpans(
  db: PrismaClient,
  creatorProfileIds: string[],
  window: Pick<StatsWindow, "start" | "end">,
): Promise<Map<string, SessionSpan[]>> {
  const byCreator = new Map<string, SessionSpan[]>();
  if (creatorProfileIds.length === 0) return byCreator;
  const rows = await db.streamSessionFact.findMany({
    where: {
      creatorProfileId: { in: creatorProfileIds },
      partitionDate: {
        gte: new Date(window.start.getTime() - SESSION_LOOKBACK_DAYS * DAY_MS),
        lt: window.end,
      },
      streamEndsAt: { gt: window.start },
      streamBeginsAt: { lt: window.end },
    },
    select: {
      creatorProfileId: true,
      streamBeginsAt: true,
      streamEndsAt: true,
    },
  });
  for (const row of rows) {
    if (!row.creatorProfileId) continue;
    const list = byCreator.get(row.creatorProfileId) ?? [];
    list.push(row);
    byCreator.set(row.creatorProfileId, list);
  }
  return byCreator;
}

/**
 * The newest day (UTC midnight) with live time in the creator's rollups, no
 * later than `lastCompleteDay`: their own CreatorDailyRollup, else SH channel
 * rollups matched by identity (the same fallback getStreamingStats uses).
 * Twitch VOD-only airtime isn't seen here; those profiles keep 30D.
 */
export async function getLastStreamDay(
  db: PrismaClient,
  creatorProfileId: string,
  lastCompleteDay: Date,
): Promise<Date | null> {
  const [creatorDay, accounts] = await Promise.all([
    db.creatorDailyRollup.findFirst({
      where: {
        creatorProfileId,
        date: { lte: lastCompleteDay },
        uniqueAirtimeMinutes: { gt: 0 },
      },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    getStreamHatchetAccounts(db, creatorProfileId),
  ]);
  const identity = streamHatchetRollupIdentityWhere(accounts);
  const channelDay =
    identity.length > 0
      ? await db.channelDailyRollup.findFirst({
          where: {
            OR: identity,
            date: { lte: lastCompleteDay },
            airtimeMinutes: { gt: 0 },
          },
          orderBy: { date: "desc" },
          select: { date: true },
        })
      : null;
  const days = [creatorDay?.date, channelDay?.date].filter(
    (d): d is Date => d != null,
  );
  if (days.length === 0) return null;
  return new Date(Math.max(...days.map((d) => d.getTime())));
}

/**
 * Server-decided Stats Row defaults (lib/stats-period.ts). On any failure
 * the Stats Row falls back to its own 30D default.
 */
export async function getStatsContext(
  db: PrismaClient,
  creatorProfileId: string,
): Promise<StatsContext | undefined> {
  try {
    const lastCompleteDay = await getLastCompleteStatsDay();
    const lastStreamDay = await getLastStreamDay(
      db,
      creatorProfileId,
      lastCompleteDay,
    );
    return {
      initialPeriod: pickStatsPeriod(lastStreamDay, lastCompleteDay),
      lastStreamDay: lastStreamDay?.toISOString() ?? null,
    };
  } catch {
    return undefined;
  }
}

type ViewerAccumulator = {
  peak: number | null;
  values: number[];
};

function extractViewers(
  acc: ViewerAccumulator,
  ext: Record<string, unknown>,
): void {
  const metrics = viewerMetricsFromExtended(ext);
  if (metrics.peak !== null && (acc.peak === null || metrics.peak > acc.peak)) {
    acc.peak = metrics.peak;
  }
  if (metrics.avg !== null && metrics.avg > 0) {
    acc.values.push(metrics.avg);
  }
}

/**
 * Batched per-creator streaming stats for the `/creators` list view.
 *
 * Same aggregation rules as the profile page (trpc snapshot.getStreamingStats,
 * via services/streaming-stats): MetricSnapshot extendedMetrics plus Stream
 * Hatchet daily rollups, with the SH watch-time-weighted average preferred
 * over the mean of per-poll samples. The list resolves SH rows by linked
 * creatorProfileId (one indexed query for the whole page) rather than the
 * profile's richer identity matching. Failures on individual Twitch airtime
 * calls degrade to null airtime for that row only.
 */
export async function getStreamingStatsBatch(
  creatorProfileIds: string[],
  opts: { sinceDays?: number } = {},
): Promise<Map<string, StreamingStats>> {
  const result = new Map<string, StreamingStats>();
  if (creatorProfileIds.length === 0) return result;

  for (const id of creatorProfileIds) {
    result.set(id, emptyStreamingStats());
  }

  const sinceDays = opts.sinceDays ?? 30;
  // Same complete-day window as the profile page, so the list and the
  // profile show one number for one creator.
  const window = await getStatsWindow(sinceDays);
  const since = window.start;

  const [snapshots, rollups, creatorRollups, twitchAccounts, sessionSpans] =
    await Promise.all([
      prisma.metricSnapshot.findMany({
        where: {
          creatorProfileId: { in: creatorProfileIds },
          snapshotAt: { gte: since, lt: window.end },
        },
        select: {
          creatorProfileId: true,
          extendedMetrics: true,
        },
      }),
      prisma.channelDailyRollup.findMany({
        where: {
          creatorProfileId: { in: creatorProfileIds },
          date: { gte: since, lte: window.lastDay },
        },
        select: {
          creatorProfileId: true,
          platform: true,
          sessionCount: true,
          airtimeMinutes: true,
          minutesWatched: true,
          peakViewers: true,
        },
      }),
      // C27: merged per-creator days, so a simulcast is not counted twice.
      // Falls back to the per-platform rows above for creators the rollup
      // pass has not covered yet.
      prisma.creatorDailyRollup.findMany({
        where: {
          creatorProfileId: { in: creatorProfileIds },
          date: { gte: since, lte: window.lastDay },
        },
        select: {
          creatorProfileId: true,
          date: true,
          uniqueAirtimeMinutes: true,
          minutesWatched: true,
          streamBlocks: true,
          platforms: true,
          intervals: true,
          peakViewers: true,
          peakPlatform: true,
        },
      }),
      prisma.platformAccount.findMany({
        where: {
          creatorProfileId: { in: creatorProfileIds },
          platform: "twitch",
        },
        select: {
          creatorProfileId: true,
          platformUserId: true,
        },
      }),
      loadSessionSpans(prisma, creatorProfileIds, window),
    ]);

  const viewerAccs = new Map<string, ViewerAccumulator>();
  for (const snap of snapshots) {
    const ext = snap.extendedMetrics as Record<string, unknown> | null;
    if (!ext) continue;
    let acc = viewerAccs.get(snap.creatorProfileId);
    if (!acc) {
      acc = { peak: null, values: [] };
      viewerAccs.set(snap.creatorProfileId, acc);
    }
    extractViewers(acc, ext);
  }

  type RollupRow = (typeof rollups)[number];
  const rollupsByCreator = new Map<string, RollupRow[]>();
  for (const row of rollups) {
    if (!row.creatorProfileId) continue;
    const list = rollupsByCreator.get(row.creatorProfileId) ?? [];
    list.push(row);
    rollupsByCreator.set(row.creatorProfileId, list);
  }

  const creatorRollupsByCreator = new Map<string, CreatorRollupDay[]>();
  for (const row of creatorRollups) {
    const list = creatorRollupsByCreator.get(row.creatorProfileId) ?? [];
    list.push(row);
    creatorRollupsByCreator.set(row.creatorProfileId, list);
  }

  const shTotalsByCreator = new Map<
    string,
    ShRollupTotals & { coversTwitch: boolean }
  >();
  for (const [creatorId, rows] of rollupsByCreator) {
    const totals = aggregateShRollups(rows);
    const coversTwitch = rows.some(
      (row) => internalPlatformForStreamHatchet(row.platform) === "twitch",
    );
    shTotalsByCreator.set(creatorId, { ...totals, coversTwitch });
  }

  /** Merged per-creator totals win; per-platform sums are the fallback. */
  function totalsFor(creatorId: string): ShRollupTotals | null {
    const merged = creatorRollupsByCreator.get(creatorId);
    if (merged && merged.length > 0) return aggregateCreatorRollups(merged);
    return shTotalsByCreator.get(creatorId) ?? null;
  }

  function applyAirtime(creatorId: string, totals: ShRollupTotals | null) {
    const stats = result.get(creatorId);
    if (!stats || !totals || totals.airtimeSeconds <= 0) return;
    stats.airTimeSeconds = totals.airtimeSeconds;
    stats.avgAirTimeSeconds =
      totals.streamCount > 0
        ? Math.round(totals.airtimeSeconds / totals.streamCount)
        : null;
  }

  for (const creatorId of creatorProfileIds) {
    const stats = result.get(creatorId)!;
    const acc = viewerAccs.get(creatorId) ?? { peak: null, values: [] };
    const totals = totalsFor(creatorId);

    const { peakViewers, avgViewers } = combineViewerStats(
      { peak: acc.peak, avgSamples: acc.values },
      totals,
    );
    stats.peakViewers = peakViewers;
    stats.avgViewers = avgViewers;

    applyAirtime(creatorId, totals);
  }

  const airtimeOutcomes = await Promise.allSettled(
    twitchAccounts.map(async (account) => {
      // When SH rollups already cover Twitch for this creator, skip the
      // Videos API — adding it would double-count the same streams. Creators
      // on the merged path still fetch: their VOD time is unioned per day, so
      // a day SH missed can be filled without double-counting the rest.
      const merged = creatorRollupsByCreator.get(account.creatorProfileId);
      const sh = shTotalsByCreator.get(account.creatorProfileId);
      if (!merged?.length && sh?.coversTwitch) return null;

      const videos = await fetchVideos(account.platformUserId, {
        startedAfter: since,
        limit: 200,
      });
      const vods = clipVodsToWindow(
        videos.map((v) => ({
          startedAt: new Date(v.createdAt),
          durationSeconds: v.durationSeconds,
        })),
        window,
      );
      return { creatorProfileId: account.creatorProfileId, vods };
    }),
  );

  for (const outcome of airtimeOutcomes) {
    if (outcome.status !== "fulfilled" || outcome.value === null) continue;
    const { creatorProfileId, vods } = outcome.value;
    if (vods.length === 0) continue;
    const stats = result.get(creatorProfileId);
    if (!stats) continue;

    const merged = creatorRollupsByCreator.get(creatorProfileId);
    if (merged?.length) {
      // Union, not sum: the VOD intervals merge into each day's live blocks.
      applyAirtime(creatorProfileId, aggregateCreatorRollups(merged, vods));
      continue;
    }

    const airTime = vods.reduce((sum, v) => sum + v.durationSeconds, 0);
    stats.airTimeSeconds = (stats.airTimeSeconds ?? 0) + airTime;
    const sh = shTotalsByCreator.get(creatorProfileId);
    const totalStreams = (sh?.streamCount ?? 0) + vods.length;
    stats.avgAirTimeSeconds =
      totalStreams > 0
        ? Math.round((stats.airTimeSeconds ?? 0) / totalStreams)
        : null;
  }

  // Avg Airtime like BI: whole sessions that touch the window. The block-based
  // figures above stay as the fallback for creators SH has no sessions for.
  for (const [creatorId, spans] of sessionSpans) {
    const stats = result.get(creatorId);
    const average = averageSessionAirtime(spans, window);
    if (stats && average) stats.avgAirTimeSeconds = average.meanSeconds;
  }

  return result;
}
