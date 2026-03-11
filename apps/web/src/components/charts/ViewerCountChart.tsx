"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { Platform } from "@twitchmetrics/database";
import { BaseChart } from "./BaseChart";
import { CHART_PLATFORM_COLORS } from "./theme";
import { formatNumber, formatDate } from "@/lib/utils/format";

type ViewerCountChartProps = {
  data: { date: string; viewers: number; game?: string }[];
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

    const peakIndex = values.reduce(
      (maxIdx, val, idx) => (val > (values[maxIdx] ?? 0) ? idx : maxIdx),
      0,
    );
    const peakDate = dates[peakIndex] ?? "";
    const peakValue = values[peakIndex] ?? 0;

    return {
      grid: { left: 60, right: 20, top: 20, bottom: 30 },
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
          const date = formatDate(p.axisValue);
          const viewers = formatNumber(p.value);
          const game = data[p.dataIndex]?.game;

          return `
            <div style="font-size:13px">
              <div style="margin-bottom:4px;color:#949BA4">${date}</div>
              <div style="font-weight:600">${viewers} viewers</div>
              ${game ? `<div style="color:#949BA4;font-size:12px">${game}</div>` : ""}
            </div>
          `;
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
                  color: "#949BA4",
                  fontSize: 11,
                },
                lineStyle: {
                  color: "#949BA4",
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

  return <BaseChart option={option} height={height} loading={loading} />;
}
