import { Prisma, prisma } from "@twitchmetrics/database";
import { csvRow, escapeCsvField } from "@/server/utils/csv";
import type {
  MetricKey,
  TemplateConfig,
} from "@/lib/constants/report-templates";

type GenerateArgs = {
  entityIds?: string[];
  selectedMetrics?: string[];
};

const SNAPSHOT_INTERVAL_SECONDS = 30 * 60;
const MIN_GOOD_COVERAGE_PERCENT = 80;

// ─── Formatting ────────────────────────────────────────────────

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

// ─── Period helpers ────────────────────────────────────────────

function periodStart(timePeriod: string, end: Date): Date {
  const days =
    timePeriod === "30d"
      ? 30
      : timePeriod === "90d"
        ? 90
        : timePeriod === "6m"
          ? 183
          : timePeriod === "12m"
            ? 365
            : 30;
  return new Date(end.getTime() - days * 86_400_000);
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
    Math.ceil(
      (end.getTime() - start.getTime()) / (SNAPSHOT_INTERVAL_SECONDS * 1000),
    ),
  );
}

function selectedMetricsFor(
  config: TemplateConfig,
  requested: string[] | undefined,
): MetricKey[] {
  if (!requested || requested.length === 0) return config.allowedMetrics;
  const allowed = new Set(config.allowedMetrics);
  return requested.filter((m): m is MetricKey => allowed.has(m as MetricKey));
}

type DataQuality = "Good" | "Partial" | "Low" | "No data";

function dataQualityFor(
  snapshotCount: number,
  coveragePercent: number,
): DataQuality {
  if (snapshotCount === 0) return "No data";
  if (coveragePercent >= MIN_GOOD_COVERAGE_PERCENT) return "Good";
  if (coveragePercent >= 50) return "Partial";
  return "Low";
}

// ─── Games: SQL aggregation ────────────────────────────────────
//
// Single-pass aggregation over GameViewerSnapshot. LEAD() over each game's
// snapshots yields the time gap to the next snapshot, capped at 30 minutes
// and clamped to the period end — identical math to the previous in-memory
// algorithm, but executed in Postgres so only the result rows cross the wire.

type GameAggregateRow = {
  game_id: string;
  hours_watched: Prisma.Decimal;
  observed_hours: Prisma.Decimal;
  peak_viewers: number;
  snapshot_count: bigint;
  first_snapshot: Date;
  last_snapshot: Date;
};

async function aggregateGames(
  start: Date,
  end: Date,
  filter:
    | { byId: true; entityIds: string[] }
    | { byId: false; topCount: number },
): Promise<GameAggregateRow[]> {
  const gameFilter = filter.byId
    ? Prisma.sql`AND "gameId" = ANY(${filter.entityIds}::uuid[])`
    : Prisma.empty;
  const limitClause = filter.byId
    ? Prisma.empty
    : Prisma.sql`LIMIT ${filter.topCount}`;

  return prisma.$queryRaw<GameAggregateRow[]>(Prisma.sql`
    WITH ordered AS (
      SELECT
        "gameId" AS game_id,
        "snapshotAt" AS snapshot_at,
        "twitchViewers" AS twitch_viewers,
        LEAD("snapshotAt") OVER (
          PARTITION BY "gameId" ORDER BY "snapshotAt"
        ) AS next_at
      FROM "GameViewerSnapshot"
      WHERE "snapshotAt" >= ${start}
        AND "snapshotAt" <= ${end}
        ${gameFilter}
    ),
    intervals AS (
      SELECT
        game_id,
        snapshot_at,
        twitch_viewers,
        GREATEST(
          0,
          LEAST(
            ${SNAPSHOT_INTERVAL_SECONDS}::numeric,
            EXTRACT(EPOCH FROM (
              LEAST(
                ${end}::timestamptz,
                COALESCE(next_at, snapshot_at + INTERVAL '30 minutes')
              ) - snapshot_at
            ))
          )
        ) AS interval_seconds
      FROM ordered
    )
    SELECT
      game_id,
      SUM(twitch_viewers * interval_seconds / 3600.0)::numeric AS hours_watched,
      SUM(interval_seconds / 3600.0)::numeric AS observed_hours,
      MAX(twitch_viewers)::int AS peak_viewers,
      COUNT(*)::bigint AS snapshot_count,
      MIN(snapshot_at) AS first_snapshot,
      MAX(snapshot_at) AS last_snapshot
    FROM intervals
    GROUP BY game_id
    ORDER BY hours_watched DESC
    ${limitClause}
  `);
}

// ─── Games: report ────────────────────────────────────────────

async function generateGamesReport(
  config: TemplateConfig,
  reportName: string,
  args: GenerateArgs,
): Promise<string> {
  const generatedAt = new Date();
  const since = periodStart(config.timePeriod, generatedAt);
  const metrics = selectedMetricsFor(config, args.selectedMetrics);
  const byId = config.topCount === "byId";
  const entityIds = args.entityIds ?? [];
  const expectedSnapshots = expectedSnapshotCount(since, generatedAt);

  // 1. SQL aggregation: ranks + computes metrics in one pass
  const aggregates = byId
    ? entityIds.length > 0
      ? await aggregateGames(since, generatedAt, {
          byId: true,
          entityIds,
        })
      : []
    : await aggregateGames(since, generatedAt, {
        byId: false,
        topCount: typeof config.topCount === "number" ? config.topCount : 50,
      });

  // 2. Hydrate detail rows only for the chosen game IDs
  const needsTopChannels = metrics.includes("topCreators");
  const chosenIds = byId ? entityIds : aggregates.map((a) => a.game_id);

  const games =
    chosenIds.length > 0
      ? await prisma.game.findMany({
          where: { id: { in: chosenIds } },
          ...(needsTopChannels
            ? {
                include: {
                  topChannels: {
                    orderBy: { viewerHours: "desc" },
                    take: 5,
                  },
                },
              }
            : {}),
        })
      : [];

  const gameById = new Map(games.map((g) => [g.id, g] as const));
  const aggById = new Map(aggregates.map((a) => [a.game_id, a] as const));

  // byId preserves user-selected order; non-byId follows SQL hours-watched rank
  const orderedIds = byId ? entityIds : aggregates.map((a) => a.game_id);

  type GameRow = (typeof games)[number];
  type RenderRow = {
    game: GameRow;
    hoursWatched: number;
    observedHours: number;
    avgViewers: number | null;
    peakViewers: number | null;
    snapshotCount: number;
    coveragePercent: number;
    firstSnapshot: Date | null;
    lastSnapshot: Date | null;
    dataQuality: DataQuality;
  };

  const rows: RenderRow[] = orderedIds
    .map((id) => gameById.get(id))
    .filter((g): g is GameRow => Boolean(g))
    .map((game) => {
      const agg = aggById.get(game.id);
      const snapshotCount = Number(agg?.snapshot_count ?? 0n);
      const hoursWatched = Number(agg?.hours_watched ?? 0);
      const observedHours = Number(agg?.observed_hours ?? 0);
      const coveragePercent = Math.min(
        100,
        (snapshotCount / expectedSnapshots) * 100,
      );
      return {
        game,
        hoursWatched,
        observedHours,
        avgViewers:
          observedHours > 0 ? Math.round(hoursWatched / observedHours) : null,
        peakViewers: agg?.peak_viewers ?? null,
        snapshotCount,
        coveragePercent,
        firstSnapshot: agg?.first_snapshot ?? null,
        lastSnapshot: agg?.last_snapshot ?? null,
        dataQuality: dataQualityFor(snapshotCount, coveragePercent),
      };
    });

  // 3. Build column list
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

  // 4. Header block + methodology
  const lines: string[] = [];
  lines.push(csvRow("Report", reportName));
  lines.push(csvRow("Period", periodLabel(config.timePeriod)));
  lines.push(csvRow("Period Start", since.toISOString()));
  lines.push(csvRow("Period End", generatedAt.toISOString()));
  lines.push(csvRow("Platforms", config.platforms.join(" + ")));
  lines.push(csvRow("Generated", generatedAt.toISOString()));
  lines.push(csvRow("Source", "Twitch API via TwitchMetrics game snapshots"));
  lines.push(csvRow("Snapshot Cadence", "Every 30 minutes"));
  lines.push(
    csvRow(
      "Ranking Basis",
      byId
        ? "User-selected games, preserving selected order"
        : "Estimated Twitch hours watched inside the selected period",
    ),
  );
  lines.push(
    csvRow(
      "Methodology",
      "Hours watched and average viewers are computed from observed Twitch game viewer snapshots inside the period. Average viewers is time-weighted by observed snapshot intervals.",
    ),
  );
  lines.push(
    csvRow(
      "Data Quality",
      `Good means at least ${MIN_GOOD_COVERAGE_PERCENT}% snapshot coverage for the period. Lower coverage is still exported but flagged per row.`,
    ),
  );
  if (metrics.includes("topCreators")) {
    lines.push(
      csvRow(
        "Top Channels Note",
        "Top Channels reflects the latest stored live-channel snapshot for each game, not a full-period channel ranking.",
      ),
    );
  }
  lines.push("");
  lines.push(cols.map(escapeCsvField).join(","));

  // 5. Data rows
  let totalHours = 0;
  let totalObservedHours = 0;
  let maxPeak = 0;
  let lowCoverageRows = 0;

  rows.forEach((r, i) => {
    totalHours += r.hoursWatched;
    totalObservedHours += r.observedHours;
    if (r.peakViewers !== null && r.peakViewers > maxPeak) {
      maxPeak = r.peakViewers;
    }
    if (r.coveragePercent < MIN_GOOD_COVERAGE_PERCENT) lowCoverageRows++;

    const cells: unknown[] = [i + 1, r.game.name];
    if (metrics.includes("hoursWatched")) cells.push(fmtHours(r.hoursWatched));
    if (metrics.includes("avgViewers"))
      cells.push(r.avgViewers !== null ? fmt(r.avgViewers) : "N/A");
    if (metrics.includes("peakViewers"))
      cells.push(r.peakViewers !== null ? fmt(r.peakViewers) : "N/A");
    if (metrics.includes("topCreators")) {
      const topChannels =
        "topChannels" in r.game
          ? (r.game as GameRow & { topChannels: { channelName: string }[] })
              .topChannels
          : [];
      cells.push(
        topChannels
          .slice(0, 3)
          .map((c) => c.channelName)
          .join(" | "),
      );
    }
    cells.push(
      r.snapshotCount,
      expectedSnapshots,
      fmtPercent(r.coveragePercent),
      fmtDateTime(r.firstSnapshot),
      fmtDateTime(r.lastSnapshot),
      r.dataQuality,
    );

    lines.push(cells.map(escapeCsvField).join(","));
  });

  // 6. Summary block
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
  lines.push(sumCells.map(escapeCsvField).join(","));

  lines.push("");
  lines.push(
    csvRow(
      "",
      `Data covers ${rows.length} games over ${periodLabel(config.timePeriod)}.`,
    ),
  );
  if (lowCoverageRows > 0) {
    lines.push(
      csvRow(
        "",
        `${lowCoverageRows} row(s) are below ${MIN_GOOD_COVERAGE_PERCENT}% snapshot coverage and are flagged in the Data Quality column.`,
      ),
    );
  }
  lines.push(csvRow("", "© TwitchMetrics — twitchmetrics.vercel.app"));

  return lines.join("\n");
}

// ─── Channels: SQL aggregation ──────────────────────────────────
//
// extendedMetrics is JSON, so Prisma's groupBy can't reach into it. A single
// CTE ranks each creator's snapshots by recency (rn), then in the outer
// query we aggregate viewer stats across the whole window AND pluck the
// latest follower count from rn=1. Same fallback chain as the previous JS:
// AVG_VIEWERS → LIVE_VIEWER_COUNT for averages; PEAK_VIEWERS →
// LIVE_VIEWER_COUNT for peaks.

type ChannelAggregateRow = {
  creator_profile_id: string;
  latest_followers: bigint | null;
  avg_viewers: Prisma.Decimal | null;
  peak_viewers: number | null;
  observations: bigint;
};

async function aggregateChannels(
  creatorIds: string[],
  since: Date,
): Promise<ChannelAggregateRow[]> {
  if (creatorIds.length === 0) return [];

  return prisma.$queryRaw<ChannelAggregateRow[]>(Prisma.sql`
    WITH ranked AS (
      SELECT
        "creatorProfileId",
        "snapshotAt",
        "followerCount",
        "extendedMetrics",
        ROW_NUMBER() OVER (
          PARTITION BY "creatorProfileId" ORDER BY "snapshotAt" DESC
        ) AS rn
      FROM "MetricSnapshot"
      WHERE "creatorProfileId" = ANY(${creatorIds}::uuid[])
        AND platform = 'twitch'::"Platform"
        AND "snapshotAt" >= ${since}
    )
    SELECT
      "creatorProfileId" AS creator_profile_id,
      MAX("followerCount") FILTER (WHERE rn = 1) AS latest_followers,
      AVG(
        CASE
          WHEN jsonb_typeof("extendedMetrics"->'AVG_VIEWERS') = 'number'
            AND ("extendedMetrics"->>'AVG_VIEWERS')::numeric > 0
            THEN ("extendedMetrics"->>'AVG_VIEWERS')::numeric
          WHEN jsonb_typeof("extendedMetrics"->'LIVE_VIEWER_COUNT') = 'number'
            AND ("extendedMetrics"->>'LIVE_VIEWER_COUNT')::numeric > 0
            THEN ("extendedMetrics"->>'LIVE_VIEWER_COUNT')::numeric
          ELSE NULL
        END
      ) AS avg_viewers,
      MAX(
        CASE
          WHEN jsonb_typeof("extendedMetrics"->'PEAK_VIEWERS') = 'number'
            THEN ("extendedMetrics"->>'PEAK_VIEWERS')::int
          WHEN jsonb_typeof("extendedMetrics"->'LIVE_VIEWER_COUNT') = 'number'
            THEN ("extendedMetrics"->>'LIVE_VIEWER_COUNT')::int
          ELSE NULL
        END
      ) AS peak_viewers,
      COUNT(*) FILTER (
        WHERE jsonb_typeof("extendedMetrics"->'PEAK_VIEWERS') = 'number'
           OR jsonb_typeof("extendedMetrics"->'LIVE_VIEWER_COUNT') = 'number'
      ) AS observations
    FROM ranked
    GROUP BY "creatorProfileId"
  `);
}

// ─── Channels: report ────────────────────────────────────────────

async function generateChannelsReport(
  config: TemplateConfig,
  reportName: string,
  args: GenerateArgs,
): Promise<string> {
  const generatedAt = new Date();
  const since = periodStart(config.timePeriod, generatedAt);
  const metrics = config.allowedMetrics;
  const byId = config.topCount === "byId";
  const entityIds = args.entityIds ?? [];

  // 1. Pick the creator set — same selection logic as before
  const creators = byId
    ? entityIds.length > 0
      ? await prisma.creatorProfile.findMany({
          where: { id: { in: entityIds } },
        })
      : []
    : await prisma.creatorProfile.findMany({
        take: typeof config.topCount === "number" ? config.topCount : 500,
        where: { primaryPlatform: "twitch" },
        orderBy: { totalFollowers: "desc" },
      });

  // Preserve byId order
  if (byId) {
    const order = new Map(entityIds.map((id, i) => [id, i] as const));
    creators.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  // 2. Aggregate snapshots in a single SQL pass
  const creatorIds = creators.map((c) => c.id);
  const aggregates = await aggregateChannels(creatorIds, since);
  const aggById = new Map(
    aggregates.map((a) => [a.creator_profile_id, a] as const),
  );

  const needsViewerStats =
    metrics.includes("avgViewers") || metrics.includes("peakViewers");

  // 3. Columns
  const cols: string[] = ["Rank", "Channel", "Followers"];
  if (metrics.includes("avgViewers")) cols.push("Avg Viewers");
  if (metrics.includes("peakViewers")) cols.push("Peak Viewers");
  if (needsViewerStats) cols.push("Live Observations");
  if (metrics.includes("gender")) cols.push("Gender (if available)");
  if (metrics.includes("country")) cols.push("Primary Country");

  // 4. Header block
  const lines: string[] = [];
  lines.push(csvRow("Report", reportName));
  lines.push(csvRow("Period", periodLabel(config.timePeriod)));
  lines.push(csvRow("Platforms", config.platforms.join(" + ")));
  lines.push(csvRow("Generated", generatedAt.toISOString().split("T")[0]));
  lines.push(csvRow("Source", "TwitchMetrics"));
  if (needsViewerStats) {
    lines.push(
      csvRow(
        "Note",
        "Viewer metrics aggregated from live-stream snapshots. 'N/A' means the channel was not observed live during this period.",
      ),
    );
  }
  lines.push("");
  lines.push(cols.map(escapeCsvField).join(","));

  // 5. Data rows
  let totalFollowers = 0n;
  let observedChannels = 0;
  const runningAvgSum: number[] = [];
  let runningPeakMax = 0;

  creators.forEach((creator, i) => {
    const agg = aggById.get(creator.id);
    const followers =
      agg?.latest_followers != null
        ? agg.latest_followers
        : creator.totalFollowers;
    totalFollowers += BigInt(Number(followers));

    const avgViewers =
      agg?.avg_viewers != null ? Math.round(Number(agg.avg_viewers)) : null;
    const peakViewers = agg?.peak_viewers ?? null;
    const observations = Number(agg?.observations ?? 0n);

    if (observations > 0) observedChannels++;
    if (avgViewers !== null) runningAvgSum.push(avgViewers);
    if (peakViewers !== null && peakViewers > runningPeakMax) {
      runningPeakMax = peakViewers;
    }

    const cells: unknown[] = [
      i + 1,
      creator.displayName,
      fmt(Number(followers)),
    ];
    if (metrics.includes("avgViewers")) {
      cells.push(avgViewers !== null ? fmt(avgViewers) : "N/A");
    }
    if (metrics.includes("peakViewers")) {
      cells.push(peakViewers !== null ? fmt(peakViewers) : "N/A");
    }
    if (needsViewerStats) cells.push(observations);
    if (metrics.includes("gender")) cells.push(creator.gender ?? "N/A");
    if (metrics.includes("country")) cells.push(creator.country ?? "N/A");

    lines.push(cells.map(escapeCsvField).join(","));
  });

  // 6. Summary
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
  lines.push(sumCells.map(escapeCsvField).join(","));

  lines.push("");
  if (needsViewerStats) {
    lines.push(
      csvRow(
        "",
        `Observed ${observedChannels} of ${creators.length} channels live during ${periodLabel(config.timePeriod)}.`,
      ),
    );
  }
  lines.push(
    csvRow(
      "",
      `Total followers across ${creators.length} channels: ${fmt(Number(totalFollowers))}`,
    ),
  );
  lines.push(csvRow("", "© TwitchMetrics — twitchmetrics.vercel.app"));

  return lines.join("\n");
}

// ─── Entry point ────────────────────────────────────────────────

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
