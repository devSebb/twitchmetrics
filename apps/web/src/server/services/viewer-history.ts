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

// Viewer history for the Viewer Count widget. MetricSnapshots (fine-grained,
// API-polled) are preferred; platforms without them — notably the SH kick
// catalog, which is never API-polled — fall back to StreamHatchet daily
// rollups (one point per streamed day).
export async function getViewerHistory(
  prisma: PrismaClient,
  input: {
    creatorProfileId: string;
    platform: Platform;
    period: ViewerHistoryPeriod;
  },
): Promise<ViewerHistory> {
  const days = { "7d": 7, "30d": 30, "90d": 90 }[input.period];
  // UTC-midnight start so @db.Date rollup rows on the boundary day are
  // included in the fallback query.
  const since = rollupWindowStart(days);

  const snapshots = await prisma.metricSnapshot.findMany({
    where: {
      creatorProfileId: input.creatorProfileId,
      platform: input.platform,
      snapshotAt: { gte: since },
    },
    select: { snapshotAt: true, extendedMetrics: true },
    orderBy: { snapshotAt: "asc" },
  });

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

  // Live badge from the latest snapshot, when fresh.
  let liveInfo: { viewers: number | null } | null = null;
  const latest = snapshots[snapshots.length - 1];
  if (latest && isRecentObservation(latest.snapshotAt)) {
    const ext = latest.extendedMetrics as Record<string, unknown> | null;
    if (ext && (ext.IS_LIVE === 1 || ext.IS_LIVE === true)) {
      liveInfo = {
        viewers:
          typeof ext.LIVE_VIEWER_COUNT === "number"
            ? ext.LIVE_VIEWER_COUNT
            : null,
      };
    }
  }

  let source: ViewerHistory["source"] = "snapshots";

  if (
    points.length === 0 &&
    STREAMHATCHET_SUPPORTED_PLATFORMS.includes(input.platform)
  ) {
    const accounts = (
      await getStreamHatchetAccounts(prisma, input.creatorProfileId)
    ).filter((account) => account.platform === input.platform);
    const identity = streamHatchetRollupIdentityWhere(accounts);

    if (identity.length > 0) {
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

      for (const [date, entry] of byDay) {
        points.push({
          date,
          viewers: entry.viewers,
          ...(entry.peak !== null ? { peak: entry.peak } : {}),
          ...(entry.game !== null ? { game: entry.game } : {}),
        });
      }
      if (byDay.size > 0) source = "streamhatchet_rollups";
    }
  }

  const latestAt =
    latest?.snapshotAt.toISOString() ?? points[points.length - 1]?.date ?? null;

  return { points, liveInfo, latestAt, source };
}
