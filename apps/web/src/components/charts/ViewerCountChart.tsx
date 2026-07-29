"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { Platform } from "@twitchmetrics/database";
import { BaseChart } from "./BaseChart";
import { CHART_PLATFORM_COLORS } from "./theme";
import { axisNumber, chartDateLabel, tooltipHtml } from "./format";
import { formatNumber } from "@/lib/utils/format";
import { THEME } from "@/lib/constants/theme";

type ViewerCountChartProps = {
  data: {
    date: string;
    viewers: number;
    /** True recorded peak for this point, when measured. */
    peak?: number;
    game?: string;
  }[];
  platform: Platform;
  loading?: boolean;
  height?: number;
};

export function ViewerCountChart({
  data,
  platform,
  loading = false,
  height = 400,
}: ViewerCountChartProps) {
  const color = CHART_PLATFORM_COLORS[platform] ?? "#9146ff";

  const option = useMemo((): EChartsOption => {
    const dates = data.map((d) => d.date);
    const values = data.map((d) => d.viewers);

    if (values.length === 0) {
      return { series: [] };
    }

    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

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
            { value: `${formatNumber(p.value)} avg viewers` },
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
                  formatter: `Avg: ${formatNumber(avg)}`,
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
                  formatter: () => `Peak ${formatNumber(peakLabelValue)}`,
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
  }, [data, color]);

  return <BaseChart option={option} height={height} loading={loading} />;
}
