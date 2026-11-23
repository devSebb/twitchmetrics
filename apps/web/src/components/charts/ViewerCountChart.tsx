"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { Platform } from "@twitchmetrics/database";
import { BaseChart } from "./BaseChart";
import { CHART_PLATFORM_COLORS } from "./theme";
import { axisNumber, chartDateLabel, tooltipHtml } from "./format";
import { formatNumber } from "@/lib/utils/format";
import { THEME } from "@/lib/constants/theme";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";

type ViewerPoint = {
  date: string;
  viewers: number;
  /** True recorded peak for this point, when measured. */
  peak?: number;
  game?: string;
};

type ViewerCountChartProps = {
  data: ViewerPoint[];
  platform: Platform;
  /**
   * The creator's other platforms, one more line each. With several lines a
   * legend replaces the average line and the peak marker, which would only
   * describe one of them; clicking a platform in the legend hides it.
   */
  others?: { platform: Platform; data: ViewerPoint[] }[];
  loading?: boolean;
  height?: number;
  /** Tooltip noun for a point. Daily series are averages; snapshots are not. */
  valueLabel?: string;
  /**
   * Average and peak computed by the caller, with the window they cover. Game
   * charts pass the header's time-weighted figures so the avg line and the
   * peak marker print the same numbers as the header for the same window.
   */
  summary?: { average: number; peak: number; windowLabel: string } | undefined;
};

/** One line per platform over the days any of them streamed. */
function platformLinesOption(
  lines: { platform: Platform; data: ViewerPoint[] }[],
  valueLabel: string,
): EChartsOption {
  const dates = [
    ...new Set(lines.flatMap((line) => line.data.map((point) => point.date))),
  ].sort();
  const byDate = lines.map(
    (line) => new Map(line.data.map((point) => [point.date, point])),
  );

  return {
    grid: { left: 60, right: 20, top: 36, bottom: 30 },
    legend: {
      top: 0,
      right: 8,
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
    },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel: {
        formatter: (val: string) => chartDateLabel(val, "compact"),
      },
      boundaryGap: false,
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: axisNumber },
      splitNumber: 4,
    },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = (Array.isArray(params) ? params : [params]) as {
          seriesIndex: number;
          seriesName: string;
          axisValue: string;
          color: string;
        }[];
        const first = items[0];
        if (!first) return "";
        return tooltipHtml(
          chartDateLabel(first.axisValue, "full"),
          items.flatMap((item) => {
            const point = byDate[item.seriesIndex]?.get(first.axisValue);
            if (!point) return [];
            const detail = [
              point.peak !== undefined
                ? `${formatNumber(point.peak)} peak`
                : null,
              point.game ?? null,
            ].filter((part) => part !== null);
            return [
              {
                bullet: item.color,
                label: item.seriesName,
                value: `${formatNumber(point.viewers)} ${valueLabel}`,
              },
              ...(detail.length > 0
                ? [
                    {
                      value: detail.join(" · "),
                      color: THEME.colors.textMuted,
                      small: true,
                      plain: true,
                    },
                  ]
                : []),
            ];
          }),
        );
      },
    },
    series: lines.map((line, index) => ({
      name: PLATFORM_CONFIG[line.platform].name,
      type: "line" as const,
      data: dates.map((date) => byDate[index]?.get(date)?.viewers ?? null),
      // A platform has a point only on the days it streamed.
      connectNulls: true,
      smooth: true,
      symbol: "circle",
      symbolSize: 4,
      color: CHART_PLATFORM_COLORS[line.platform],
      lineStyle: { width: 2 },
    })),
  };
}

export function ViewerCountChart({
  data,
  platform,
  others,
  loading = false,
  height = 400,
  valueLabel = "avg viewers",
  summary,
}: ViewerCountChartProps) {
  const color = CHART_PLATFORM_COLORS[platform] ?? "#9146ff";

  const option = useMemo((): EChartsOption => {
    const dates = data.map((d) => d.date);
    const values = data.map((d) => d.viewers);

    if (values.length === 0) {
      return { series: [] };
    }
    if (others && others.length > 0) {
      return platformLinesOption([{ platform, data }, ...others], valueLabel);
    }

    const avg =
      summary?.average ??
      Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const avgLabel = summary
      ? `${summary.windowLabel} avg: ${formatNumber(avg)}`
      : `Avg: ${formatNumber(avg)}`;

    // Prefer the true recorded peak; the plotted series is averages, so the
    // max of the series is only a fallback label, not a real peak.
    let peakIndex = values.reduce(
      (maxIdx, val, idx) => (val > (values[maxIdx] ?? 0) ? idx : maxIdx),
      0,
    );
    let peakLabelValue = values[peakIndex] ?? 0;
    let bestTruePeak = -Infinity;
    data.forEach((point, idx) => {
      if (point.peak !== undefined && point.peak > bestTruePeak) {
        bestTruePeak = point.peak;
        peakIndex = idx;
      }
    });
    if (bestTruePeak > -Infinity) {
      peakLabelValue = bestTruePeak;
    }
    if (summary) {
      const summaryIndex = values.indexOf(summary.peak);
      if (summaryIndex >= 0) peakIndex = summaryIndex;
      peakLabelValue = summary.peak;
    }
    const peakLabel = summary
      ? `${summary.windowLabel} peak: ${formatNumber(peakLabelValue)}`
      : `Peak ${formatNumber(peakLabelValue)}`;
    const peakDate = dates[peakIndex] ?? "";
    // Marker sits on the plotted line at the peak day; its label carries the
    // true peak value (which may exceed the averaged series).
    const peakValue = values[peakIndex] ?? 0;

    return {
      grid: { left: 60, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: {
          formatter: (val: string) => chartDateLabel(val, "compact"),
        },
        boundaryGap: false,
      },
      yAxis: {
        type: "value",
        axisLabel: {
          formatter: axisNumber,
        },
        splitNumber: 4,
      },
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const p = (Array.isArray(params) ? params[0] : params) as {
            dataIndex: number;
            value: number;
            axisValue: string;
          };
          const point = data[p.dataIndex];

          return tooltipHtml(chartDateLabel(p.axisValue, "full"), [
            { value: `${formatNumber(p.value)} ${valueLabel}` },
            ...(point?.peak !== undefined
              ? [
                  {
                    value: `${formatNumber(point.peak)} peak`,
                    color: THEME.colors.textMuted,
                    small: true,
                    plain: true,
                  },
                ]
              : []),
            ...(point?.game
              ? [
                  {
                    value: point.game,
                    color: THEME.colors.textMuted,
                    small: true,
                    plain: true,
                  },
                ]
              : []),
          ]);
        },
      },
      series: [
        {
          type: "line" as const,
          data: values,
          smooth: true,
          symbol: "none",
          lineStyle: { color, width: 2 },
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: color + "40" },
                { offset: 1, color: color + "00" },
              ],
            },
          },
          markLine: {
            silent: true,
            symbol: "none",
            data: [
              {
                yAxis: avg,
                label: {
                  formatter: avgLabel,
                  position: "insideEndTop" as const,
                  color: THEME.colors.textMuted,
                  fontSize: 11,
                },
                lineStyle: {
                  color: THEME.colors.textMuted,
                  type: "dashed" as const,
                  width: 1,
                },
              },
            ],
          },
          markPoint: {
            data: [
              {
                coord: [peakDate, peakValue],
                name: "Peak",
                symbol: "circle",
                symbolSize: 8,
                itemStyle: { color },
                label: {
                  show: true,
                  formatter: () => peakLabel,
                  position: "top" as const,
                  color: THEME.colors.textHeader,
                  fontSize: 11,
                },
              },
            ],
          },
        },
      ],
    };
  }, [data, platform, others, color, valueLabel, summary]);

  return <BaseChart option={option} height={height} loading={loading} />;
}
