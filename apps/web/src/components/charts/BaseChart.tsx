"use client";

import { useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart, PieChart, GaugeChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
  MarkLineComponent,
  TitleComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

// Register only the modules we need
echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
  MarkLineComponent,
  TitleComponent,
  CanvasRenderer,
]);

// Side-effect: registers the twitchmetrics theme
import "./theme";

type BaseChartProps = {
  option: EChartsOption;
  height?: string | number;
  loading?: boolean;
  className?: string;
};

function hasData(option: EChartsOption): boolean {
  if (!option.series) return false;
  const series = Array.isArray(option.series) ? option.series : [option.series];
  return series.some(
    (s) =>
      s &&
      Array.isArray((s as { data?: unknown[] }).data) &&
      (s as { data: unknown[] }).data.length > 0,
  );
}

export function BaseChart({
  option,
  height = 400,
  loading = false,
  className,
}: BaseChartProps) {
  const chartRef = useRef<ReactECharts>(null);

  if (loading) {
    return (
      <div
        className={className}
        style={{ height: typeof height === "number" ? `${height}px` : height }}
      >
        <div className="flex h-full w-full animate-pulse items-center justify-center rounded-lg bg-[#383A40]">
          <span className="text-sm text-[#949BA4]">Loading chart...</span>
        </div>
      </div>
    );
  }

  if (!hasData(option)) {
    return (
      <div
        className={className}
        style={{ height: typeof height === "number" ? `${height}px` : height }}
      >
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-[#3F4147] bg-[#313338]">
          <span className="text-sm text-[#949BA4]">No data available</span>
        </div>
      </div>
    );
  }

  return (
    <ReactECharts
      ref={chartRef}
      echarts={echarts}
      option={option}
      theme="twitchmetrics"
      style={{ height: typeof height === "number" ? `${height}px` : height }}
      className={className}
      notMerge
      lazyUpdate
      opts={{ renderer: "canvas" }}
    />
  );
}
