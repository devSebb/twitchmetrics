"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChartBar, ChartLine } from "@phosphor-icons/react/dist/ssr";
import type { EChartsOption } from "echarts";
import { BaseChart } from "@/components/charts/BaseChart";
import { CHART_PLATFORM_COLORS } from "@/components/charts/theme";
import {
  axisNumber,
  chartDateTimeLabel,
  tooltipHtml,
} from "@/components/charts/format";
import { InfoTip } from "@/components/shared/InfoTip";
import { GAME_INFO } from "@/lib/constants/metric-info";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { THEME } from "@/lib/constants/theme";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/lib/utils/format";
import {
  SERIES_PLATFORMS,
  type GameSeries,
  type GameSeriesSummary,
  type SlotRun,
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
    Icon: ChartLine,
  },
  channels: {
    title: "Live Channels",
    info: GAME_INFO.channelActivity,
    Icon: ChartBar,
  },
} as const;

type MarkAreaPoint = { xAxis: number; name?: string };

/** The runs of slots where any platform holds a day's average. */
function estimatedRuns(series: GameSeries): SlotRun[] {
  const filled = new Set<number>();
  for (const runs of Object.values(series.estimated ?? {})) {
    for (const [first, last] of runs) {
      for (let index = first; index <= last; index++) filled.add(index);
    }
  }
  const merged: SlotRun[] = [];
  for (const index of [...filled].sort((a, b) => a - b)) {
    const run = merged[merged.length - 1];
    if (run && run[1] === index - 1) run[1] = index;
    else merged.push([index, index]);
  }
  return merged;
}

function buildOption(series: GameSeries, metric: Metric): EChartsOption {
  const times = series.slots.map((slot) => Date.parse(slot));
  const columns = series[metric];
  const platforms = SERIES_PLATFORMS.filter((platform) => columns[platform]);
  const axisLine = { lineStyle: { color: THEME.colors.border } };
  // Days without live readings hold a day's average: viewers only.
  const estimated = metric === "viewers" ? estimatedRuns(series) : [];
  const isEstimated = (time: number) =>
    estimated.some(
      ([first, last]) => time >= times[first]! && time <= times[last]!,
    );

  return {
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = (Array.isArray(params) ? params : [params]) as {
          seriesName: string;
          value: [number, number | null];
          color: string;
        }[];
        const shown = items.filter((item) => item.value[1] !== null);
        const first = items[0];
        if (!first || shown.length === 0) return "";
        const rows = shown.map((item) => ({
          bullet: item.color,
          label: item.seriesName,
          value: formatNumber(item.value[1] ?? 0),
        }));
        if (shown.length > 1) {
          rows.push({
            bullet: "transparent",
            label: "Total",
            value: formatNumber(
              shown.reduce((sum, item) => sum + (item.value[1] ?? 0), 0),
            ),
          });
        }
        const notes = isEstimated(first.value[0])
          ? [
              {
                label: "",
                value: "Daily average: no live readings",
                plain: true,
                small: true,
                color: THEME.colors.textMuted,
              },
            ]
          : [];
        return tooltipHtml(
          chartDateTimeLabel(new Date(first.value[0]).toISOString()),
          [...rows, ...notes],
        );
      },
    },
    legend: {
      top: 0,
      right: 8,
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
    },
    grid: { left: 12, right: 16, top: 32, bottom: 0, containLabel: true },
    xAxis: {
      type: "time",
      axisLine,
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: THEME.colors.textMuted,
        fontSize: 10,
        hideOverlap: true,
        formatter: {
          month: "{MMM} {d}",
          day: "{MMM} {d}",
          hour: "{HH}:{mm}",
          minute: "{HH}:{mm}",
        },
      },
    },
    yAxis: {
      type: "value",
      axisLabel: { fontSize: 10, formatter: axisNumber },
      splitLine: { lineStyle: { color: THEME.colors.border, type: "dashed" } },
    },
    series: [
      ...platforms.map((platform) => ({
        name: PLATFORM_CONFIG[platform].name,
        type: "line" as const,
        stack: "platforms",
        smooth: false,
        symbol: "none",
        color: CHART_PLATFORM_COLORS[platform],
        lineStyle: { width: 1 },
        areaStyle: { opacity: 0.6 },
        emphasis: { disabled: true },
        data: times.map((time, index) => [time, columns[platform]![index]!]),
      })),
      // A veil over the days drawn from daily averages, so their flat level
      // doesn't read as a measured one. Its own series, to sit above the areas.
      ...(estimated.length > 0
        ? [
            {
              type: "line" as const,
              z: 10,
              silent: true,
              symbol: "none",
              data: times.map((time) => [time, null]),
              markArea: {
                silent: true,
                // Marked areas sit under the series unless raised.
                z: 10,
                itemStyle: { color: THEME.colors.surface, opacity: 0.55 },
                label: {
                  position: "insideTop" as const,
                  color: THEME.colors.textMuted,
                  fontSize: 10,
                },
                data: estimated.map(
                  ([first, last], run): [MarkAreaPoint, MarkAreaPoint] => [
                    {
                      xAxis: times[first]!,
                      name: run === 0 ? "Daily average" : "",
                    },
                    { xAxis: times[last]! },
                  ],
                ),
              },
            },
          ]
        : []),
    ],
  };
}

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
  const { title, info, Icon } = COPY[metric];

  // Both charts share this query, so one request serves the pair.
  const { data, isLoading } = useQuery({
    queryKey: ["game-series", slug, period, until],
    queryFn: async (): Promise<GameSeriesData | null> => {
      const params = new URLSearchParams({ period });
      if (until) params.set("until", until);
      const res = await fetch(`/api/games/${slug}/snapshots?${params}`);
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

  const option = buildOption(
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
    <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#F2F3F5]">
            <Icon size={16} weight="duotone" className="text-[#949BA4]" />
            {title}
            <InfoTip info={info} />
          </h2>
          {summary && <span className="text-xs text-[#949BA4]">{summary}</span>}
        </div>
        <div className="flex gap-1 rounded-md bg-[#1E1F22] p-0.5">
          {PERIODS.map((value) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                period === value
                  ? "bg-[#383A40] text-[#F2F3F5]"
                  : "text-[#949BA4] hover:text-[#DBDEE1]",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <BaseChart option={option} height={height} loading={isLoading} />
      {notes.length > 0 && (
        <p className="mt-2 text-[11px] text-[#949BA4]">{notes.join(" · ")}</p>
      )}
    </div>
  );
}
