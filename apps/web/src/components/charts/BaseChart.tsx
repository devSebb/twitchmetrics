"use client";

import { useEffect, useRef, useState } from "react";
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
  appearance?: "legacy" | "noticed";
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
  appearance = "legacy",
}: BaseChartProps) {
  const chartRef = useRef<ReactECharts>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (appearance !== "noticed") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(media.matches);
    const update = () => setReduceMotion(media.matches);
    media.addEventListener("change", update);
    let disposed = false;
    void document.fonts.ready.then(() => {
      if (!disposed) chartRef.current?.getEchartsInstance().resize();
    });
    return () => {
      disposed = true;
      media.removeEventListener("change", update);
    };
  }, [appearance]);

  if (loading) {
    return (
      <div
        className={className}
        style={{ height: typeof height === "number" ? `${height}px` : height }}
      >
        <div
          role="status"
          className={`flex h-full w-full animate-pulse items-center justify-center rounded-lg ${appearance === "noticed" ? "bg-n-surface text-n-slate" : "bg-[#383A40] text-[#949BA4]"}`}
        >
          <span className="text-sm">Loading chart...</span>
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
        <div
          role="status"
          className={`flex h-full w-full items-center justify-center rounded-lg border ${appearance === "noticed" ? "border-n-line bg-n-canvas text-n-slate" : "border-[#3F4147] bg-[#313338] text-[#949BA4]"}`}
        >
          <span className="text-sm">No data available</span>
        </div>
      </div>
    );
  }

  return (
    <ReactECharts
      ref={chartRef}
      echarts={echarts}
      option={
        appearance === "noticed" && reduceMotion
          ? { ...option, animation: false }
          : option
      }
      theme={appearance === "noticed" ? "noticed" : "twitchmetrics"}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
      className={className}
      notMerge
      lazyUpdate
      opts={{ renderer: "canvas" }}
    />
  );
}
