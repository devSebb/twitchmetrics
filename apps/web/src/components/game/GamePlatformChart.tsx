"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BaseChart } from "@/components/charts/BaseChart";
import { InfoTip } from "@/components/shared/InfoTip";
import { GAME_INFO } from "@/lib/constants/metric-info";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { buildGameChartOption, estimatedRuns } from "./game-chart-option";
import { WidgetQueryError } from "@/components/widgets/WidgetQueryError";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/lib/utils/format";
import {
  type GameSeries,
  type GameSeriesSummary,
} from "@/server/services/game-viewer-series";

/**
 * One of the game page's two charts: viewers or live channels over time,
 * stacked by platform, so the top edge is the total. Both read the series the
 * header's numbers come from. Clicking a platform in the legend hides it.
 */

type Metric = "viewers" | "channels";

export type GameSeriesData = { series: GameSeries; summary: GameSeriesSummary };

type GamePlatformChartProps = {
  slug: string;
  metric: Metric;
  /** The page's newest snapshot: every period ends here, like the header. */
  until: string | null;
  /** The 7d window the header was derived from. */
  initialData: GameSeriesData | null;
  height?: number;
};

const PERIODS = ["24h", "7d", "30d"] as const;
type Period = (typeof PERIODS)[number];

const COPY = {
  viewers: {
    title: "Viewership",
    info: GAME_INFO.viewership,
  },
  channels: {
    title: "Live Channels",
    info: GAME_INFO.channelActivity,
  },
} as const;

/** "7d avg 98.9K · peak 181K", from the same arithmetic as the header. */
function summaryLine(
  summary: GameSeriesSummary,
  metric: Metric,
  period: Period,
): string | null {
  if (metric === "channels") {
    return summary.avgChannels.total > 0
      ? `${period} avg ${formatNumber(summary.avgChannels.total)}`
      : null;
  }
  return summary.avgViewers.total > 0
    ? `${period} avg ${formatNumber(summary.avgViewers.total)} · peak ${formatNumber(summary.peakViewers)}`
    : null;
}

const utcDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "Nov 17 – Nov 19", the days the chart draws from daily averages. */
function estimatedDays(series: GameSeries, metric: Metric): string | null {
  const runs = metric === "viewers" ? estimatedRuns(series) : [];
  const first = runs[0];
  const last = runs[runs.length - 1];
  if (!first || !last) return null;
  const from = utcDay.format(new Date(series.slots[first[0]]!));
  const to = utcDay.format(new Date(series.slots[last[1]]!));
  const days = from === to ? from : `${from} – ${to}`;
  return `${days}: daily averages, live readings unavailable`;
}

/** Platforms whose readings begin partway into the period, with the day. */
function lateStarts(summary: GameSeriesSummary, metric: Metric): string | null {
  const rows = (
    metric === "viewers" ? summary.avgViewers : summary.avgChannels
  ).rows.filter((row) => row.since !== null);
  if (rows.length === 0) return null;
  return rows
    .map(
      (row) =>
        `${PLATFORM_CONFIG[row.platform].name} from ${formatDate(row.since!, "compact")}`,
    )
    .join(" · ");
}

export function GamePlatformChart({
  slug,
  metric,
  until,
  initialData,
  height = 300,
}: GamePlatformChartProps) {
  // 7d first: the header's window.
  const [period, setPeriod] = useState<Period>("7d");
  const { title, info } = COPY[metric];

  // Both charts share this query, so one request serves the pair.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["game-series", slug, period, until],
    queryFn: async (): Promise<GameSeriesData | null> => {
      const params = new URLSearchParams({ period });
      if (until) params.set("until", until);
      const res = await fetch(`/api/games/${slug}/snapshots?${params}`);
      if (!res.ok) throw new Error("Category history unavailable");
      const json = (await res.json()) as {
        data: GameSeries | null;
        meta: { summary?: GameSeriesSummary };
      };
      return json.data && json.meta.summary
        ? { series: json.data, summary: json.meta.summary }
        : null;
    },
    ...(period === "7d" && initialData ? { initialData } : {}),
    staleTime: 60_000,
  });

  const option = buildGameChartOption(
    data?.series ?? { slots: [], viewers: {}, channels: {} },
    metric,
  );
  const summary = data ? summaryLine(data.summary, metric, period) : null;
  const notes = data
    ? [
        estimatedDays(data.series, metric),
        lateStarts(data.summary, metric),
      ].filter((note) => note !== null)
    : [];

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="flex items-center gap-2 text-xl font-bold tracking-tight text-n-ink">
            {title}
            <InfoTip info={info} />
          </h3>
          {summary && <span className="text-xs text-n-slate">{summary}</span>}
        </div>
        <div
          role="group"
          aria-label={`${title} period`}
          className="flex flex-wrap gap-1"
        >
          {PERIODS.map((value) => (
            <button
              key={value}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={cn(
                "min-h-11 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
                period === value
                  ? "bg-n-surface text-n-ink"
                  : "text-n-slate hover:text-n-ink",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {isError ? (
        <WidgetQueryError
          label={
            metric === "viewers" ? "viewership history" : "channel activity"
          }
          onRetry={() => void refetch()}
        />
      ) : (
        <BaseChart option={option} height={height} loading={isLoading} />
      )}
      {notes.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-n-slate">
          {notes.join(" · ")}
        </p>
      )}
    </div>
  );
}
