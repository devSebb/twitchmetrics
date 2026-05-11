import { prisma } from "@twitchmetrics/database";
import { fetchVideos } from "@/server/adapters/twitch";

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
  const peak =
    typeof ext.PEAK_VIEWERS === "number"
      ? ext.PEAK_VIEWERS
      : typeof ext.LIVE_VIEWER_COUNT === "number"
        ? ext.LIVE_VIEWER_COUNT
        : null;
  if (peak !== null && (acc.peak === null || peak > acc.peak)) {
    acc.peak = peak;
  }

  const avg =
    typeof ext.AVG_VIEWERS === "number"
      ? ext.AVG_VIEWERS
      : typeof ext.LIVE_VIEWER_COUNT === "number"
        ? ext.LIVE_VIEWER_COUNT
        : null;
  if (avg !== null && avg > 0) {
    acc.values.push(avg);
  }
}

function finalizeViewers(acc: ViewerAccumulator): {
  peakViewers: number | null;
  avgViewers: number | null;
} {
  const avgViewers =
    acc.values.length > 0
      ? Math.round(acc.values.reduce((a, b) => a + b, 0) / acc.values.length)
      : null;
  return { peakViewers: acc.peak, avgViewers };
}

/**
 * Batched per-creator streaming stats for the `/creators` list view.
 *
 * Reads peak/avg viewers from MetricSnapshot.extendedMetrics in a single query,
 * and fans out Twitch Videos API calls in parallel for airtime. Failures on
 * individual Twitch calls degrade to null airtime for that row only.
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
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const [snapshots, twitchAccounts] = await Promise.all([
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

  for (const [creatorId, acc] of viewerAccs) {
    const stats = result.get(creatorId);
    if (!stats) continue;
    const { peakViewers, avgViewers } = finalizeViewers(acc);
    stats.peakViewers = peakViewers;
    stats.avgViewers = avgViewers;
  }

  const airtimeOutcomes = await Promise.allSettled(
    twitchAccounts.map(async (account) => {
      const videos = await fetchVideos(account.platformUserId, {
        startedAfter: since,
        limit: 200,
      });
      return { creatorProfileId: account.creatorProfileId, videos };
    }),
  );

  for (const outcome of airtimeOutcomes) {
    if (outcome.status !== "fulfilled") continue;
    const { creatorProfileId, videos } = outcome.value;
    if (videos.length === 0) continue;
    const stats = result.get(creatorProfileId);
    if (!stats) continue;
    const airTime = videos.reduce((sum, v) => sum + v.durationSeconds, 0);
    stats.airTimeSeconds = airTime;
    stats.avgAirTimeSeconds = Math.round(airTime / videos.length);
  }

  return result;
}
