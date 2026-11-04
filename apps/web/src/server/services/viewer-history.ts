import type { Platform, PrismaClient } from "@twitchmetrics/database";
import { isRecentObservation } from "@/lib/metric-freshness";
import { rollupWindowStart } from "@/server/services/streaming-stats";
import {
  STREAMHATCHET_SUPPORTED_PLATFORMS,
  getStreamHatchetAccounts,
  streamHatchetRollupIdentityWhere,
} from "@/server/services/streamhatchet-identity";

export type ViewerHistoryPeriod = "7d" | "30d" | "90d";

export type ViewerHistoryPoint = {
  date: string;
  viewers: number;
  peak?: number;
  game?: string;
};

export type ViewerHistory = {
  points: ViewerHistoryPoint[];
  liveInfo: { viewers: number | null } | null;
  latestAt: string | null;
  source: "snapshots" | "streamhatchet_rollups";
};

type SnapshotRow = { snapshotAt: Date; extendedMetrics: unknown };

// Viewer history for the Viewer Count widget. StreamHatchet daily rollups
// (one point per streamed day) come first: they are measured over every
// minute of every stream, so the line and its peak match Stream Hatchet and
// the Recent Streams widget. Our own MetricSnapshots are one live reading
// every 6–24 h, which lands on a random moment of a stream and almost never
// on its peak (QA 2026-11, ibai 30d: snapshot max 108,786 vs SH peak
// 127,045). Snapshots remain the series for creators Stream Hatchet doesn't
// cover, and the source of the live badge.
export async function getViewerHistory(
  prisma: PrismaClient,
  input: {
    creatorProfileId: string;
    platform: Platform;
    period: ViewerHistoryPeriod;
  },
): Promise<ViewerHistory> {
  const days = { "7d": 7, "30d": 30, "90d": 90 }[input.period];
  // UTC midnight, so @db.Date rollup rows on the boundary day are included.
  const since = rollupWindowStart(days);
  const snapshotWhere = {
    creatorProfileId: input.creatorProfileId,
    platform: input.platform,
    snapshotAt: { gte: since },
  };

  const [rollupPoints, latest] = await Promise.all([
    getStreamHatchetDailyPoints(prisma, input, since),
    prisma.metricSnapshot.findFirst({
      where: snapshotWhere,
      select: { snapshotAt: true, extendedMetrics: true },
      orderBy: { snapshotAt: "desc" },
    }),
  ]);

  let points = rollupPoints;
  let source: ViewerHistory["source"] = "streamhatchet_rollups";
  if (points.length === 0) {
    const snapshots = await prisma.metricSnapshot.findMany({
      where: snapshotWhere,
      select: { snapshotAt: true, extendedMetrics: true },
      orderBy: { snapshotAt: "asc" },
    });
    points = snapshotPoints(snapshots);
    source = "snapshots";
  }

  const latestAt =
    latest?.snapshotAt.toISOString() ?? points[points.length - 1]?.date ?? null;

  return { points, liveInfo: liveInfoFrom(latest), latestAt, source };
}

async function getStreamHatchetDailyPoints(
  prisma: PrismaClient,
  input: { creatorProfileId: string; platform: Platform },
  since: Date,
): Promise<ViewerHistoryPoint[]> {
  if (!STREAMHATCHET_SUPPORTED_PLATFORMS.includes(input.platform)) return [];

  const accounts = (
    await getStreamHatchetAccounts(prisma, input.creatorProfileId)
  ).filter((account) => account.platform === input.platform);
  const identity = streamHatchetRollupIdentityWhere(accounts);
  if (identity.length === 0) return [];

  const rollups = await prisma.channelDailyRollup.findMany({
    where: { OR: identity, date: { gte: since } },
    select: {
      date: true,
      averageViewers: true,
      peakViewers: true,
      primaryGameName: true,
    },
    orderBy: { date: "asc" },
  });

  // yt/ytg can both contribute rows for one day — keep the max.
  const byDay = new Map<
    string,
    { viewers: number; peak: number | null; game: string | null }
  >();
  for (const rollup of rollups) {
    if (rollup.averageViewers == null) continue;
    const dayKey = rollup.date.toISOString();
    const viewers = Math.round(rollup.averageViewers);
    const existing = byDay.get(dayKey);
    const peak =
      rollup.peakViewers === null
        ? (existing?.peak ?? null)
        : Math.max(existing?.peak ?? 0, rollup.peakViewers);
    if (!existing || viewers > existing.viewers) {
      byDay.set(dayKey, {
        viewers,
        peak,
        game: rollup.primaryGameName ?? null,
      });
    } else if (peak !== existing.peak) {
      existing.peak = peak;
    }
  }

  return [...byDay].map(([date, entry]) => ({
    date,
    viewers: entry.viewers,
    ...(entry.peak !== null ? { peak: entry.peak } : {}),
    ...(entry.game !== null ? { game: entry.game } : {}),
  }));
}

function snapshotPoints(snapshots: SnapshotRow[]): ViewerHistoryPoint[] {
  const points: ViewerHistoryPoint[] = [];
  for (const snapshot of snapshots) {
    const ext = snapshot.extendedMetrics as Record<string, unknown> | null;
    const viewers =
      typeof ext?.AVG_VIEWERS === "number"
        ? ext.AVG_VIEWERS
        : typeof ext?.LIVE_VIEWER_COUNT === "number"
          ? ext.LIVE_VIEWER_COUNT
          : null;
    if (viewers === null) continue;

    // True recorded peak (no live-count fallback — the chart series is
    // averages, and the marker must not claim a peak we didn't measure).
    const peak =
      typeof ext?.PEAK_VIEWERS === "number" ? ext.PEAK_VIEWERS : undefined;
    const game =
      typeof ext?.CURRENT_GAME === "string" ? ext.CURRENT_GAME : undefined;
    points.push({
      date: snapshot.snapshotAt.toISOString(),
      viewers,
      ...(peak !== undefined ? { peak } : {}),
      ...(game !== undefined ? { game } : {}),
    });
  }
  return points;
}

// Live badge from the latest snapshot, when fresh.
function liveInfoFrom(latest: SnapshotRow | null): ViewerHistory["liveInfo"] {
  if (!latest || !isRecentObservation(latest.snapshotAt)) return null;
  const ext = latest.extendedMetrics as Record<string, unknown> | null;
  if (!ext || (ext.IS_LIVE !== 1 && ext.IS_LIVE !== true)) return null;
  return {
    viewers:
      typeof ext.LIVE_VIEWER_COUNT === "number" ? ext.LIVE_VIEWER_COUNT : null,
  };
}
