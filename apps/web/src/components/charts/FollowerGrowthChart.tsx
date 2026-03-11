"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { Platform } from "@twitchmetrics/database";
import { BaseChart } from "./BaseChart";
import { CHART_PLATFORM_COLORS } from "./theme";
import { formatNumber, formatDate } from "@/lib/utils/format";

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
  const color = CHART_PLATFORM_COLORS[platform] ?? "#9146ff";

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
          formatter: (val: string) => formatDate(val, "compact"),
        },
        boundaryGap: false,
      },
      yAxis: {
        type: "value",
        axisLabel: {
          formatter: (val: number) => formatNumber(val),
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
          const date = formatDate(p.axisValue);
          const prev = idx > 0 ? (values[idx - 1] ?? val) : val;
          const diff = val - prev;
          const sign = diff >= 0 ? "+" : "";
          const deltaStr = `${sign}${formatNumber(diff)}`;
          const deltaColor =
            diff > 0 ? "#22c55e" : diff < 0 ? "#ef4444" : "#949BA4";

          return `
            <div style="font-size:13px">
              <div style="margin-bottom:4px;color:#949BA4">${date}</div>
              <div style="font-weight:600">${formatNumber(val)}</div>
              <div style="color:${deltaColor};font-size:12px">${deltaStr} from previous</div>
            </div>
          `;
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
                  color: "#F2F3F5",
                  fontSize: 11,
                },
              },
            ],
          },
        },
      ],
    };
  }, [data, color]);

  return (
    <div>
      {onPeriodChange && (
        <div className="mb-3 flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-[#383A40] text-[#F2F3F5]"
                  : "text-[#949BA4] hover:bg-[#383A40] hover:text-[#DBDEE1]"
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
