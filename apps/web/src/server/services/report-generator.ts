import { prisma } from "@twitchmetrics/database";
import type { TemplateConfig } from "@/lib/constants/report-templates";

type GenerateArgs = {
  entityIds?: string[];
};

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function row(...cells: unknown[]): string {
  return cells.map(esc).join(",");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtHours(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// ─── Period helpers ───────────────────────────────────────────────────────────

function periodStart(timePeriod: string): Date {
  const now = new Date();
  switch (timePeriod) {
    case "30d":
      return new Date(now.getTime() - 30 * 86400_000);
    case "90d":
      return new Date(now.getTime() - 90 * 86400_000);
    case "6m":
      return new Date(now.getTime() - 183 * 86400_000);
    case "12m":
      return new Date(now.getTime() - 365 * 86400_000);
    default:
      return new Date(now.getTime() - 30 * 86400_000);
  }
}

function periodLabel(timePeriod: string): string {
  const labels: Record<string, string> = {
    "30d": "Last 30 Days",
    "90d": "Last 90 Days",
    "6m": "Last 6 Months",
    "12m": "Last 12 Months",
  };
  return labels[timePeriod] ?? "Custom";
}

// ─── Games report ─────────────────────────────────────────────────────────────

async function generateGamesReport(
  config: TemplateConfig,
  reportName: string,
  args: GenerateArgs = {},
): Promise<string> {
  const since = periodStart(config.timePeriod);
  const metrics = config.allowedMetrics;
  const byId = config.topCount === "byId";
  const entityIds = args.entityIds ?? [];

  const games = byId
    ? await prisma.game.findMany({
        where: { id: { in: entityIds } },
        include: {
          viewerSnapshots: {
            where: { snapshotAt: { gte: since } },
            orderBy: { snapshotAt: "asc" },
          },
          topChannels: { orderBy: { viewerHours: "desc" }, take: 5 },
        },
      })
    : await prisma.game.findMany({
        take: typeof config.topCount === "number" ? config.topCount : 500,
        orderBy: [{ hoursWatched7d: "desc" }, { avgViewers7d: "desc" }],
        include: {
          viewerSnapshots: {
            where: { snapshotAt: { gte: since } },
            orderBy: { snapshotAt: "asc" },
          },
          topChannels: { orderBy: { viewerHours: "desc" }, take: 5 },
        },
      });

  // Preserve the user's picking order when byId.
  if (byId) {
    const order = new Map(entityIds.map((id, i) => [id, i] as const));
    games.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  // ── Build column list ──────────────────────────────────────────────────────
  const cols: string[] = ["Rank", "Game"];
  if (metrics.includes("hoursWatched")) cols.push("Hours Watched (est.)");
  if (metrics.includes("avgViewers")) cols.push("Avg Viewers");
  if (metrics.includes("peakViewers")) cols.push("Peak Viewers");
  if (metrics.includes("topCreators")) cols.push("Top Channels (by viewers)");

  const lines: string[] = [];

  // ── Report header ──────────────────────────────────────────────────────────
  lines.push(row("Report", reportName));
  lines.push(row("Period", periodLabel(config.timePeriod)));
  lines.push(row("Platforms", config.platforms.join(" + ")));
  lines.push(row("Generated", new Date().toISOString().split("T")[0]));
  lines.push(row("Source", "TwitchMetrics"));
  lines.push("");

  // ── Column headers ─────────────────────────────────────────────────────────
  lines.push(cols.join(","));

  // ── Data rows ──────────────────────────────────────────────────────────────
  let totalHours = 0;
  let totalAvgViewers = 0;
  let maxPeak = 0;

  games.forEach((game, i) => {
    const snaps = game.viewerSnapshots;
    let hoursWatched: number;
    let avgViewers: number;
    let peakViewers: number;

    if (snaps.length >= 2) {
      // Estimate hours watched from snapshots: sum of viewers × time delta
      let hours = 0;
      for (let j = 1; j < snaps.length; j++) {
        const deltaHours =
          (snaps[j]!.snapshotAt.getTime() -
            snaps[j - 1]!.snapshotAt.getTime()) /
          3_600_000;
        const viewers = snaps[j]!.twitchViewers + snaps[j - 1]!.twitchViewers;
        hours += (viewers / 2) * deltaHours;
      }
      hoursWatched = hours;
      avgViewers =
        snaps.reduce((s, sn) => s + sn.twitchViewers, 0) / snaps.length;
      peakViewers = Math.max(...snaps.map((sn) => sn.twitchViewers));
    } else {
      // Fall back to stored aggregates, scaled to period
      const periodDays = (Date.now() - since.getTime()) / 86400_000;
      hoursWatched = Number(game.hoursWatched7d) * (periodDays / 7);
      avgViewers = game.avgViewers7d;
      peakViewers = game.peakViewers24h;
    }

    totalHours += hoursWatched;
    totalAvgViewers += avgViewers;
    if (peakViewers > maxPeak) maxPeak = peakViewers;

    const cells: unknown[] = [i + 1, game.name];
    if (metrics.includes("hoursWatched")) cells.push(fmtHours(hoursWatched));
    if (metrics.includes("avgViewers")) cells.push(fmt(Math.round(avgViewers)));
    if (metrics.includes("peakViewers")) cells.push(fmt(peakViewers));
    if (metrics.includes("topCreators")) {
      const topCh = game.topChannels
        .slice(0, 3)
        .map((c) => c.channelName)
        .join(" | ");
      cells.push(topCh);
    }

    lines.push(cells.map(esc).join(","));
  });

  // ── Summary row ────────────────────────────────────────────────────────────
  lines.push("");
  const sumCells: unknown[] = ["", "TOTALS / AVERAGES"];
  if (metrics.includes("hoursWatched")) sumCells.push(fmtHours(totalHours));
  if (metrics.includes("avgViewers"))
    sumCells.push(fmt(Math.round(totalAvgViewers / Math.max(games.length, 1))));
  if (metrics.includes("peakViewers")) sumCells.push(fmt(maxPeak));
  if (metrics.includes("topCreators")) sumCells.push("");
  lines.push(sumCells.map(esc).join(","));

  lines.push("");
  lines.push(
    row(
      "",
      `Data covers ${games.length} games over ${periodLabel(config.timePeriod)}`,
    ),
  );
  lines.push(row("", "© TwitchMetrics — twitchmetrics.vercel.app"));

  return lines.join("\n");
}

// ─── Channels report ──────────────────────────────────────────────────────────

// Pulls AVG_VIEWERS / PEAK_VIEWERS from extendedMetrics, falling back to
// LIVE_VIEWER_COUNT when the adapter didn't stash the dedicated fields.
// Returns null when the channel was never observed live in the period.
function aggregateViewerStats(snaps: { extendedMetrics: unknown }[]): {
  avgViewers: number | null;
  peakViewers: number | null;
  observations: number;
} {
  let peakViewers: number | null = null;
  const avgSamples: number[] = [];
  let observations = 0;

  for (const s of snaps) {
    const ext = s.extendedMetrics as Record<string, unknown> | null;
    if (!ext) continue;

    const peak =
      typeof ext.PEAK_VIEWERS === "number"
        ? ext.PEAK_VIEWERS
        : typeof ext.LIVE_VIEWER_COUNT === "number"
          ? ext.LIVE_VIEWER_COUNT
          : null;

    const avg =
      typeof ext.AVG_VIEWERS === "number" && ext.AVG_VIEWERS > 0
        ? ext.AVG_VIEWERS
        : typeof ext.LIVE_VIEWER_COUNT === "number" && ext.LIVE_VIEWER_COUNT > 0
          ? ext.LIVE_VIEWER_COUNT
          : null;

    if (peak !== null) {
      if (peakViewers === null || peak > peakViewers) peakViewers = peak;
      observations++;
    }
    if (avg !== null) avgSamples.push(avg);
  }

  const avgViewers =
    avgSamples.length > 0
      ? Math.round(avgSamples.reduce((a, b) => a + b, 0) / avgSamples.length)
      : null;

  return { avgViewers, peakViewers, observations };
}

async function generateChannelsReport(
  config: TemplateConfig,
  reportName: string,
  args: GenerateArgs = {},
): Promise<string> {
  const since = periodStart(config.timePeriod);
  const metrics = config.allowedMetrics;
  const byId = config.topCount === "byId";
  const entityIds = args.entityIds ?? [];

  const creators = byId
    ? await prisma.creatorProfile.findMany({
        where: { id: { in: entityIds } },
      })
    : await prisma.creatorProfile.findMany({
        take: typeof config.topCount === "number" ? config.topCount : 500,
        where: { primaryPlatform: "twitch" },
        orderBy: { totalFollowers: "desc" },
      });

  if (byId) {
    const order = new Map(entityIds.map((id, i) => [id, i] as const));
    creators.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  // Bulk-fetch all in-window Twitch snapshots for the selected creators in a
  // single query. Grouping happens in memory — cheaper than N per-creator
  // includes, and we only need three columns.
  const creatorIds = creators.map((c) => c.id);
  const needsViewerStats =
    metrics.includes("avgViewers") || metrics.includes("peakViewers");

  const snapshots =
    creatorIds.length > 0
      ? await prisma.metricSnapshot.findMany({
          where: {
            creatorProfileId: { in: creatorIds },
            platform: "twitch",
            snapshotAt: { gte: since },
          },
          select: {
            creatorProfileId: true,
            snapshotAt: true,
            followerCount: true,
            extendedMetrics: true,
          },
          orderBy: { snapshotAt: "desc" },
        })
      : [];

  const snapsByCreator = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const arr = snapsByCreator.get(s.creatorProfileId) ?? [];
    arr.push(s);
    snapsByCreator.set(s.creatorProfileId, arr);
  }

  const cols: string[] = ["Rank", "Channel", "Followers"];
  if (metrics.includes("avgViewers")) cols.push("Avg Viewers");
  if (metrics.includes("peakViewers")) cols.push("Peak Viewers");
  if (metrics.includes("avgViewers") || metrics.includes("peakViewers")) {
    cols.push("Live Observations");
  }
  if (metrics.includes("gender")) cols.push("Gender (if available)");
  if (metrics.includes("country")) cols.push("Primary Country");

  const lines: string[] = [];

  lines.push(row("Report", reportName));
  lines.push(row("Period", periodLabel(config.timePeriod)));
  lines.push(row("Platforms", config.platforms.join(" + ")));
  lines.push(row("Generated", new Date().toISOString().split("T")[0]));
  lines.push(row("Source", "TwitchMetrics"));
  if (needsViewerStats) {
    lines.push(
      row(
        "Note",
        "Viewer metrics aggregated from live-stream snapshots. 'N/A' means the channel was not observed live during this period.",
      ),
    );
  }
  lines.push("");

  lines.push(cols.join(","));

  let totalFollowers = 0n;
  let observedChannels = 0;
  const runningAvgSum: number[] = [];
  let runningPeakMax = 0;

  creators.forEach((creator, i) => {
    const snaps = snapsByCreator.get(creator.id) ?? [];
    const latestSnap = snaps[0]; // snapshots ordered desc
    const followers = latestSnap?.followerCount ?? creator.totalFollowers;
    totalFollowers += BigInt(Number(followers));

    const stats = needsViewerStats
      ? aggregateViewerStats(snaps)
      : { avgViewers: null, peakViewers: null, observations: 0 };

    if (stats.observations > 0) observedChannels++;
    if (stats.avgViewers !== null) runningAvgSum.push(stats.avgViewers);
    if (stats.peakViewers !== null && stats.peakViewers > runningPeakMax) {
      runningPeakMax = stats.peakViewers;
    }

    const cells: unknown[] = [
      i + 1,
      creator.displayName,
      fmt(Number(followers)),
    ];
    if (metrics.includes("avgViewers")) {
      cells.push(stats.avgViewers !== null ? fmt(stats.avgViewers) : "N/A");
    }
    if (metrics.includes("peakViewers")) {
      cells.push(stats.peakViewers !== null ? fmt(stats.peakViewers) : "N/A");
    }
    if (needsViewerStats) cells.push(stats.observations);
    if (metrics.includes("gender")) cells.push(creator.gender ?? "N/A");
    if (metrics.includes("country")) cells.push(creator.country ?? "N/A");

    lines.push(cells.map(esc).join(","));
  });

  // ── Summary row ──────────────────────────────────────────────────────────
  lines.push("");
  const sumCells: unknown[] = ["", "TOTALS / AVERAGES"];
  sumCells.push(fmt(Number(totalFollowers)));
  if (metrics.includes("avgViewers")) {
    sumCells.push(
      runningAvgSum.length > 0
        ? fmt(
            Math.round(
              runningAvgSum.reduce((a, b) => a + b, 0) / runningAvgSum.length,
            ),
          )
        : "N/A",
    );
  }
  if (metrics.includes("peakViewers")) {
    sumCells.push(runningPeakMax > 0 ? fmt(runningPeakMax) : "N/A");
  }
  if (needsViewerStats) sumCells.push("");
  if (metrics.includes("gender")) sumCells.push("");
  if (metrics.includes("country")) sumCells.push("");
  lines.push(sumCells.map(esc).join(","));

  lines.push("");
  if (needsViewerStats) {
    lines.push(
      row(
        "",
        `Observed ${observedChannels} of ${creators.length} channels live during ${periodLabel(config.timePeriod)}.`,
      ),
    );
  }
  lines.push(
    row(
      "",
      `Total followers across ${creators.length} channels: ${fmt(Number(totalFollowers))}`,
    ),
  );
  lines.push(row("", "© TwitchMetrics — twitchmetrics.vercel.app"));

  return lines.join("\n");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function generateReportCsv(
  config: TemplateConfig,
  reportName: string,
  args: GenerateArgs = {},
): Promise<string> {
  if (config.includes[0] === "games") {
    return generateGamesReport(config, reportName, args);
  }
  if (config.includes[0] === "channels") {
    return generateChannelsReport(config, reportName, args);
  }
  throw new Error(`Unsupported report type: ${config.includes[0]}`);
}
