"use client";

import { memo, useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./BaseChart";
import { CHART_TREND_COLORS } from "./theme";

type SparklineProps = {
  data: number[];
  color?: string;
  trend?: "up" | "down" | "flat";
  width?: number;
  height?: number;
};

export const Sparkline = memo(function Sparkline({
  data,
  color,
  trend = "flat",
  width = 120,
  height = 40,
}: SparklineProps) {
  const lineColor = color ?? CHART_TREND_COLORS[trend];

  const option = useMemo<EChartsOption>(
    () => ({
      grid: { left: 0, right: 0, top: 0, bottom: 0 },
      xAxis: { type: "category", show: false, data: data.map((_, i) => i) },
      yAxis: { type: "value", show: false },
      tooltip: { show: false },
      legend: { show: false },
      animation: false,
      series: [
        {
          type: "line",
          data,
          smooth: true,
          symbol: "none",
          lineStyle: { color: lineColor, width: 2 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: lineColor + "30" },
                { offset: 1, color: lineColor + "00" },
              ],
            },
          },
        },
      ],
    }),
    [data, lineColor],
  );

  if (data.length === 0) {
    return <div style={{ width, height }} />;
  }

  return (
    <div style={{ width, height }}>
      <BaseChart option={option} height={height} />
    </div>
  );
});
