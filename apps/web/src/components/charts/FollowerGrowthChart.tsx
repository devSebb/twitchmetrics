"use client";
import { useChartPalette } from "@/components/ui/Appearance";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { Platform } from "@twitchmetrics/database";
import { BaseChart } from "./BaseChart";

import { axisNumber, chartDateLabel, tooltipHtml } from "./format";
import { formatNumber } from "@/lib/utils/format";

const PERIODS = ["7d", "30d", "90d", "1y", "all"] as const;

type FollowerGrowthChartProps = {
  data: { date: string; value: string }[];
  platform: Platform;
  period: string;
  onPeriodChange?: (period: string) => void;
  loading?: boolean;
};

export function FollowerGrowthChart({
  data,
  platform,
  period,
  onPeriodChange,
  loading = false,
}: FollowerGrowthChartProps) {
  const palette = useChartPalette();
  const color = palette.platforms[platform] ?? "#9146ff";

  const option = useMemo((): EChartsOption => {
    const dates = data.map((d) => d.date);
    const values = data.map((d) => Number(d.value));

    if (values.length === 0) {
      return { series: [] };
    }

    const peakIndex = values.reduce(
      (maxIdx, val, idx) => (val > (values[maxIdx] ?? 0) ? idx : maxIdx),
      0,
    );
    const peakDate = dates[peakIndex] ?? "";
    const peakValue = values[peakIndex] ?? 0;

    return {
      grid: { left: 60, right: 20, top: 20, bottom: 60 },
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
          const idx = p.dataIndex;
          const val = p.value;
          const prev = idx > 0 ? (values[idx - 1] ?? val) : val;
          const diff = val - prev;
          const sign = diff >= 0 ? "+" : "";

          return tooltipHtml(chartDateLabel(p.axisValue, "full"), [
            { value: formatNumber(val) },
            {
              value: `${sign}${formatNumber(diff)} from previous`,
              color:
                diff > 0
                  ? palette.success
                  : diff < 0
                    ? palette.error
                    : palette.muted,
              small: true,
              plain: true,
            },
          ]);
        },
      },
      dataZoom: [
        {
          type: "slider",
          start: 0,
          end: 100,
          height: 24,
          bottom: 8,
        },
      ],
      series: [
        {
          type: "line" as const,
          data: values,
          // A count holds until the next reading changes it: steps, not
          // diagonals between sparse readings.
          step: "end",
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
                  formatter: () => formatNumber(peakValue),
                  position: "top" as const,
                  color: palette.ink,
                  fontSize: 11,
                },
              },
            ],
          },
        },
      ],
    };
  }, [data, color, palette]);

  return (
    <div>
      {onPeriodChange && (
        <div className="mb-3 flex flex-wrap gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              aria-pressed={period === p}
              onClick={() => onPeriodChange(p)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-n-surface text-n-ink"
                  : "text-n-slate hover:bg-n-surface hover:text-n-ink"
              }`}
            >
              {p === "all" ? "All" : p.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      <BaseChart option={option} height={400} loading={loading} />
    </div>
  );
}
