"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChartBar } from "@phosphor-icons/react/dist/ssr";
import { BaseChart } from "@/components/charts/BaseChart";
import { CHART_PLATFORM_COLORS } from "@/components/charts/theme";
import {
  axisNumber,
  chartDateLabel,
  chartDateTimeLabel,
  chartTimeLabel,
  tooltipHtml,
} from "@/components/charts/format";
import { formatNumber } from "@/lib/utils/format";
import { THEME } from "@/lib/constants/theme";
import { cn } from "@/lib/utils";
import type { EChartsOption } from "echarts";

type ActivityPoint = {
  date: string;
  viewers: number;
  channels: number;
};

type ViewerChannelActivityChartProps = {
  slug: string;
  initialData: ActivityPoint[];
};

const PERIODS = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

const VIEWERS_COLOR = CHART_PLATFORM_COLORS.twitch;
// Darker companion shade of the viewers purple; not part of the platform
// palette, so it lives here rather than in the shared theme.
const CHANNELS_COLOR = "#4F3B8C";

function buildOption(data: ActivityPoint[], period: Period): EChartsOption {
  // Snapshots are instants: intra-day periods label by hour, longer periods
  // by day — a day-only label would repeat across every 24h point.
  const axisLabelFor =
    period === "24h" ? chartTimeLabel : (d: string) => chartDateLabel(d);
  const titleLabelFor = period === "24h" ? chartDateTimeLabel : chartDateLabel;
  const dates = data.map((d) => d.date);
  const viewers = data.map((d) => d.viewers);
  const channels = data.map((d) => d.channels);

  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const arr = Array.isArray(params) ? params : [params];
        const first = arr[0] as { axisValue: string };
        const items = arr as {
          seriesName: string;
          value: number;
          color: string;
        }[];
        return tooltipHtml(
          titleLabelFor(first.axisValue),
          items.map((item) => ({
            bullet: item.color,
            label: item.seriesName,
            value: formatNumber(item.value),
          })),
        );
      },
    },
    legend: {
      data: ["Viewers", "Channels"],
      top: 4,
      right: 8,
      textStyle: { fontSize: 11 },
      itemWidth: 12,
      itemHeight: 8,
    },
    grid: { left: 12, right: 12, top: 36, bottom: 0, containLabel: true },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel: {
        fontSize: 10,
        interval: Math.floor(data.length / 8),
        formatter: (val: string) => axisLabelFor(val),
      },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: "value",
        name: "Viewers",
        nameTextStyle: { color: THEME.colors.textMuted, fontSize: 10 },
        axisLabel: { fontSize: 10, formatter: axisNumber },
        splitLine: {
          lineStyle: { color: THEME.colors.border, type: "dashed" },
        },
      },
      {
        type: "value",
        name: "Channels",
        nameTextStyle: { color: THEME.colors.textMuted, fontSize: 10 },
        axisLabel: { fontSize: 10, formatter: axisNumber },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Viewers",
        type: "bar",
        data: viewers,
        itemStyle: { color: VIEWERS_COLOR, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 20,
      },
      {
        name: "Channels",
        type: "bar",
        yAxisIndex: 1,
        data: channels,
        itemStyle: { color: CHANNELS_COLOR, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 20,
        barGap: "20%",
      },
    ],
  };
}

export function ViewerChannelActivityChart({
  slug,
  initialData,
}: ViewerChannelActivityChartProps) {
  const [period, setPeriod] = useState<Period>("30d");

  const { data, isLoading } = useQuery({
    queryKey: ["game-activity", slug, period],
    queryFn: async () => {
      const res = await fetch(
        `/api/games/${slug}/snapshots?period=${period}&metric=all`,
      );
      const json = (await res.json()) as {
        data: { date: string; viewers: number; channels: number }[];
      };
      return json.data;
    },
    initialData: period === "30d" ? initialData : undefined,
    staleTime: 60_000,
  });

  const chartData = data ?? [];
  const option = buildOption(chartData, period);

  return (
    <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#F2F3F5]">
          <ChartBar size={16} weight="duotone" className="text-[#949BA4]" />
          Recent Viewership &amp; Channel Activity
        </h2>
        <div className="flex gap-1 rounded-md bg-[#1E1F22] p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                period === p.value
                  ? "bg-[#383A40] text-[#F2F3F5]"
                  : "text-[#949BA4] hover:text-[#DBDEE1]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <BaseChart option={option} height={280} loading={isLoading} />
    </div>
  );
}
