import { prisma, type Platform } from "@twitchmetrics/database";
import { fetchVideos } from "@/server/adapters/twitch";
import {
  aggregateShRollups,
  combineViewerStats,
  rollupWindowStart,
  viewerMetricsFromExtended,
  type ShRollupTotals,
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
  // UTC-midnight start so @db.Date rollup rows on the boundary day match.
  const since = rollupWindowStart(sinceDays);

  const [snapshots, rollups, twitchAccounts] = await Promise.all([
    prisma.metricSnapshot.findMany({
      where: {
        creatorProfileId: { in: creatorProfileIds },
        snapshotAt: { gte: since },
      },
      select: {
        creatorProfileId: true,
        extendedMetrics: true,
      },
    }),
    prisma.channelDailyRollup.findMany({
      where: {
        creatorProfileId: { in: creatorProfileIds },
        date: { gte: since },
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

  for (const creatorId of creatorProfileIds) {
    const stats = result.get(creatorId)!;
    const acc = viewerAccs.get(creatorId) ?? { peak: null, values: [] };
    const sh = shTotalsByCreator.get(creatorId) ?? null;

    const { peakViewers, avgViewers } = combineViewerStats(
      { peak: acc.peak, avgSamples: acc.values },
      sh,
    );
    stats.peakViewers = peakViewers;
    stats.avgViewers = avgViewers;

    if (sh && sh.airtimeSeconds > 0) {
      stats.airTimeSeconds = sh.airtimeSeconds;
      stats.avgAirTimeSeconds =
        sh.streamCount > 0
          ? Math.round(sh.airtimeSeconds / sh.streamCount)
          : null;
    }
  }

  const airtimeOutcomes = await Promise.allSettled(
    twitchAccounts.map(async (account) => {
      // When SH rollups already cover Twitch for this creator, skip the
      // Videos API — adding it would double-count the same streams.
      const sh = shTotalsByCreator.get(account.creatorProfileId);
      if (sh?.coversTwitch) return null;

      const videos = await fetchVideos(account.platformUserId, {
        startedAfter: since,
        limit: 200,
      });
      return { creatorProfileId: account.creatorProfileId, videos };
    }),
  );

  for (const outcome of airtimeOutcomes) {
    if (outcome.status !== "fulfilled" || outcome.value === null) continue;
    const { creatorProfileId, videos } = outcome.value;
    if (videos.length === 0) continue;
    const stats = result.get(creatorProfileId);
    if (!stats) continue;
    const airTime = videos.reduce((sum, v) => sum + v.durationSeconds, 0);
    stats.airTimeSeconds = (stats.airTimeSeconds ?? 0) + airTime;
    const sh = shTotalsByCreator.get(creatorProfileId);
    const totalStreams = (sh?.streamCount ?? 0) + videos.length;
    stats.avgAirTimeSeconds =
      totalStreams > 0
        ? Math.round((stats.airTimeSeconds ?? 0) / totalStreams)
        : null;
  }

  return result;
}
