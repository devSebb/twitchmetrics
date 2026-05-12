import { prisma } from "@twitchmetrics/database";
import type {
  MetricKey,
  TemplateConfig,
} from "@/lib/constants/report-templates";

type GenerateArgs = {
  entityIds?: string[];
  selectedMetrics?: string[];
};

const HALF_HOUR_MS = 30 * 60 * 1000;
const MIN_GOOD_COVERAGE_PERCENT = 80;

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

function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtDateTime(d: Date | null): string {
  return d ? d.toISOString() : "N/A";
}

function selectedMetricsFor(
  config: TemplateConfig,
  requested: string[] | undefined,
): MetricKey[] {
  if (!requested || requested.length === 0) return config.allowedMetrics;
  const allowed = new Set(config.allowedMetrics);
  return requested.filter((m): m is MetricKey => allowed.has(m as MetricKey));
}

// ─── Period helpers ───────────────────────────────────────────────────────────

function periodStart(timePeriod: string, end: Date): Date {
  switch (timePeriod) {
    case "30d":
      return new Date(end.getTime() - 30 * 86400_000);
    case "90d":
      return new Date(end.getTime() - 90 * 86400_000);
    case "6m":
      return new Date(end.getTime() - 183 * 86400_000);
    case "12m":
      return new Date(end.getTime() - 365 * 86400_000);
    default:
      return new Date(end.getTime() - 30 * 86400_000);
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

function expectedSnapshotCount(start: Date, end: Date): number {
  return Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / HALF_HOUR_MS),
  );
}

type GameSnapshot = {
  snapshotAt: Date;
  twitchViewers: number;
};

type GamePeriodMetrics = {
  hoursWatched: number;
  observedHours: number;
  avgViewers: number | null;
  peakViewers: number | null;
  snapshotCount: number;
  expectedSnapshots: number;
  coveragePercent: number;
  firstSnapshot: Date | null;
  lastSnapshot: Date | null;
  dataQuality: "Good" | "Partial" | "Low" | "No data";
};

function computeGamePeriodMetrics(
  snapshots: GameSnapshot[],
  start: Date,
  end: Date,
): GamePeriodMetrics {
  const ordered = [...snapshots].sort(
    (a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime(),
  );
  const expected = expectedSnapshotCount(start, end);
  const snapshotCount = ordered.length;
  const coveragePercent = Math.min(100, (snapshotCount / expected) * 100);

  let hoursWatched = 0;
  let observedMs = 0;
  let peakViewers: number | null = null;

  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i]!;
    const next = ordered[i + 1];
    const intervalStart = Math.max(
      current.snapshotAt.getTime(),
      start.getTime(),
    );
    const naturalEnd = next
      ? next.snapshotAt.getTime()
      : current.snapshotAt.getTime() + HALF_HOUR_MS;
    const intervalEnd = Math.min(naturalEnd, end.getTime());
    const intervalMs = Math.max(
      0,
      Math.min(HALF_HOUR_MS, intervalEnd - intervalStart),
    );

    if (intervalMs > 0) {
      hoursWatched += current.twitchViewers * (intervalMs / 3_600_000);
      observedMs += intervalMs;
    }

    peakViewers =
      peakViewers === null
        ? current.twitchViewers
        : Math.max(peakViewers, current.twitchViewers);
  }

  const observedHours = observedMs / 3_600_000;
  const avgViewers =
    observedHours > 0 ? Math.round(hoursWatched / observedHours) : null;

  const dataQuality =
    snapshotCount === 0
      ? "No data"
      : coveragePercent >= MIN_GOOD_COVERAGE_PERCENT
        ? "Good"
        : coveragePercent >= 50
          ? "Partial"
          : "Low";

  return {
    hoursWatched,
    observedHours,
    avgViewers,
    peakViewers,
    snapshotCount,
    expectedSnapshots: expected,
    coveragePercent,
    firstSnapshot: ordered[0]?.snapshotAt ?? null,
    lastSnapshot: ordered[ordered.length - 1]?.snapshotAt ?? null,
    dataQuality,
  };
}

// ─── Games report ─────────────────────────────────────────────────────────────

async function generateGamesReport(
  config: TemplateConfig,
  reportName: string,
  args: GenerateArgs = {},
): Promise<string> {
  const generatedAt = new Date();
  const since = periodStart(config.timePeriod, generatedAt);
  const metrics = selectedMetricsFor(config, args.selectedMetrics);
  const byId = config.topCount === "byId";
  const entityIds = args.entityIds ?? [];

  const rawGames = byId
    ? await prisma.game.findMany({
        where: { id: { in: entityIds } },
        include: {
          viewerSnapshots: {
            where: { snapshotAt: { gte: since, lte: generatedAt } },
            orderBy: { snapshotAt: "asc" },
          },
          topChannels: { orderBy: { viewerHours: "desc" }, take: 5 },
        },
      })
    : await prisma.game.findMany({
        where: {
          viewerSnapshots: {
            some: { snapshotAt: { gte: since, lte: generatedAt } },
          },
        },
        include: {
          viewerSnapshots: {
            where: { snapshotAt: { gte: since, lte: generatedAt } },
            orderBy: { snapshotAt: "asc" },
          },
          topChannels: { orderBy: { viewerHours: "desc" }, take: 5 },
        },
      });

  const gamesWithMetrics = rawGames.map((game) => ({
    game,
    period: computeGamePeriodMetrics(game.viewerSnapshots, since, generatedAt),
  }));

  if (byId) {
    const order = new Map(entityIds.map((id, i) => [id, i] as const));
    gamesWithMetrics.sort(
      (a, b) => (order.get(a.game.id) ?? 0) - (order.get(b.game.id) ?? 0),
    );
  } else {
    gamesWithMetrics.sort((a, b) => {
      if (b.period.hoursWatched !== a.period.hoursWatched) {
        return b.period.hoursWatched - a.period.hoursWatched;
      }
      if ((b.period.avgViewers ?? 0) !== (a.period.avgViewers ?? 0)) {
        return (b.period.avgViewers ?? 0) - (a.period.avgViewers ?? 0);
      }
      return (b.period.peakViewers ?? 0) - (a.period.peakViewers ?? 0);
    });
  }

  const games =
    !byId && typeof config.topCount === "number"
      ? gamesWithMetrics.slice(0, config.topCount)
      : gamesWithMetrics;

  // ── Build column list ──────────────────────────────────────────────────────
  const cols: string[] = ["Rank", "Game"];
  if (metrics.includes("hoursWatched")) cols.push("Hours Watched (est.)");
  if (metrics.includes("avgViewers")) cols.push("Avg Viewers");
  if (metrics.includes("peakViewers")) cols.push("Peak Viewers");
  if (metrics.includes("topCreators"))
    cols.push("Top Channels (latest snapshot)");
  cols.push(
    "Snapshot Count",
    "Expected Snapshots",
    "Coverage",
    "First Snapshot",
    "Last Snapshot",
    "Data Quality",
  );

  const lines: string[] = [];

  // ── Report header ──────────────────────────────────────────────────────────
  lines.push(row("Report", reportName));
  lines.push(row("Period", periodLabel(config.timePeriod)));
  lines.push(row("Period Start", since.toISOString()));
  lines.push(row("Period End", generatedAt.toISOString()));
  lines.push(row("Platforms", config.platforms.join(" + ")));
  lines.push(row("Generated", generatedAt.toISOString()));
  lines.push(row("Source", "Twitch API via TwitchMetrics game snapshots"));
  lines.push(row("Snapshot Cadence", "Every 30 minutes"));
  lines.push(
    row(
      "Ranking Basis",
      byId
        ? "User-selected games, preserving selected order"
        : "Estimated Twitch hours watched inside the selected period",
    ),
  );
  lines.push(
    row(
      "Methodology",
      "Hours watched and average viewers are computed from observed Twitch game viewer snapshots inside the period. Average viewers is time-weighted by observed snapshot intervals.",
    ),
  );
  lines.push(
    row(
      "Data Quality",
      `Good means at least ${MIN_GOOD_COVERAGE_PERCENT}% snapshot coverage for the period. Lower coverage is still exported but flagged per row.`,
    ),
  );
  if (metrics.includes("topCreators")) {
    lines.push(
      row(
        "Top Channels Note",
        "Top Channels reflects the latest stored live-channel snapshot for each game, not a full-period channel ranking.",
      ),
    );
  }
  lines.push("");

  // ── Column headers ─────────────────────────────────────────────────────────
  lines.push(cols.join(","));

  // ── Data rows ──────────────────────────────────────────────────────────────
  let totalHours = 0;
  let totalObservedHours = 0;
  let maxPeak = 0;
  let lowCoverageRows = 0;

  games.forEach(({ game, period }, i) => {
    totalHours += period.hoursWatched;
    totalObservedHours += period.observedHours;
    if (period.peakViewers !== null && period.peakViewers > maxPeak) {
      maxPeak = period.peakViewers;
    }
    if (period.coveragePercent < MIN_GOOD_COVERAGE_PERCENT) lowCoverageRows++;

    const cells: unknown[] = [i + 1, game.name];
    if (metrics.includes("hoursWatched"))
      cells.push(fmtHours(period.hoursWatched));
    if (metrics.includes("avgViewers"))
      cells.push(period.avgViewers !== null ? fmt(period.avgViewers) : "N/A");
    if (metrics.includes("peakViewers"))
      cells.push(period.peakViewers !== null ? fmt(period.peakViewers) : "N/A");
    if (metrics.includes("topCreators")) {
      const topCh = game.topChannels
        .slice(0, 3)
        .map((c) => c.channelName)
        .join(" | ");
      cells.push(topCh);
    }
    cells.push(
      period.snapshotCount,
      period.expectedSnapshots,
      fmtPercent(period.coveragePercent),
      fmtDateTime(period.firstSnapshot),
      fmtDateTime(period.lastSnapshot),
      period.dataQuality,
    );

    lines.push(cells.map(esc).join(","));
  });

  // ── Summary row ────────────────────────────────────────────────────────────
  lines.push("");
  const sumCells: unknown[] = ["", "TOTALS / AVERAGES"];
  if (metrics.includes("hoursWatched")) sumCells.push(fmtHours(totalHours));
  if (metrics.includes("avgViewers")) {
    sumCells.push(
      totalObservedHours > 0
        ? fmt(Math.round(totalHours / totalObservedHours))
        : "N/A",
    );
  }
  if (metrics.includes("peakViewers")) sumCells.push(fmt(maxPeak));
  if (metrics.includes("topCreators")) sumCells.push("");
  sumCells.push("", "", "", "", "", "");
  lines.push(sumCells.map(esc).join(","));

  lines.push("");
  lines.push(
    row(
      "",
      `Data covers ${games.length} games over ${periodLabel(config.timePeriod)}.`,
    ),
  );
  if (lowCoverageRows > 0) {
    lines.push(
      row(
        "",
        `${lowCoverageRows} row(s) are below ${MIN_GOOD_COVERAGE_PERCENT}% snapshot coverage and are flagged in the Data Quality column.`,
      ),
    );
  }
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
  const since = periodStart(config.timePeriod, new Date());
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
