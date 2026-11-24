import type { EChartsOption } from "echarts";
import { NOTICED, NOTICED_CHART_COLORS } from "@/lib/constants/noticed";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import {
  axisNumber,
  chartDateTimeLabel,
  tooltipHtml,
} from "@/components/charts/format";
import { formatNumber } from "@/lib/utils/format";
import {
  SERIES_PLATFORMS,
  type GameSeries,
  type SlotRun,
} from "@/server/services/game-viewer-series";

export type GameChartMetric = "viewers" | "channels";

type MarkAreaPoint = { xAxis: number; name?: string };

/** The runs of slots where any platform holds a day's average. */
export function estimatedRuns(series: GameSeries): SlotRun[] {
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

export function buildGameChartOption(
  series: GameSeries,
  metric: GameChartMetric,
): EChartsOption {
  const times = series.slots.map((slot) => Date.parse(slot));
  const columns = series[metric];
  const platforms = SERIES_PLATFORMS.filter((platform) => columns[platform]);
  const axisLine = { lineStyle: { color: NOTICED.line } };
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
                color: NOTICED.slate,
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
        color: NOTICED.slate,
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
      splitLine: { lineStyle: { color: NOTICED.line, type: "dashed" } },
    },
    series: [
      ...platforms.map((platform) => ({
        name: PLATFORM_CONFIG[platform].name,
        type: "line" as const,
        stack: "platforms",
        smooth: false,
        symbol: "none",
        color: NOTICED_CHART_COLORS[platform],
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
                itemStyle: { color: NOTICED.surface, opacity: 0.55 },
                label: {
                  position: "insideTop" as const,
                  color: NOTICED.slate,
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
