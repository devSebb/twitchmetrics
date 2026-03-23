"use client";

import { trpc } from "@/lib/trpc";
import { Card, Skeleton } from "@/components/ui";
import { BaseChart } from "@/components/charts/BaseChart";
import type { EChartsOption } from "echarts";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";

const STATE_COLORS: Record<string, string> = {
  unclaimed: "#949BA4",
  pending_claim: "#f59e0b",
  claimed: "#22c55e",
  premium: "#9146ff",
};

const TIER_COLORS: Record<string, string> = {
  tier1: "#f59e0b",
  tier2: "#3b82f6",
  tier3: "#949BA4",
};

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-4 text-center">
      <p className="text-2xl font-bold text-[#F2F3F5]">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-[#949BA4]">{label}</p>
    </div>
  );
}

export function SystemMetrics() {
  const { data: metrics, isLoading: metricsLoading } =
    trpc.admin.getSystemMetrics.useQuery();
  const { data: trend, isLoading: trendLoading } =
    trpc.admin.getSnapshotTrend.useQuery({ days: 30 });

  if (metricsLoading || trendLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  const stateDonutOption: EChartsOption = {
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        data: (metrics?.creatorsByState ?? []).map((r) => ({
          name: r.state,
          value: r.count,
          itemStyle: { color: STATE_COLORS[r.state] ?? "#949BA4" },
        })),
        label: { show: false },
      },
    ],
    legend: {
      orient: "vertical",
      right: 0,
      textStyle: { color: "#DBDEE1" },
    },
    tooltip: { trigger: "item" },
  };

  const tierDonutOption: EChartsOption = {
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        data: (metrics?.creatorsByTier ?? []).map((r) => ({
          name: r.tier,
          value: r.count,
          itemStyle: { color: TIER_COLORS[r.tier] ?? "#949BA4" },
        })),
        label: { show: false },
      },
    ],
    legend: {
      orient: "vertical",
      right: 0,
      textStyle: { color: "#DBDEE1" },
    },
    tooltip: { trigger: "item" },
  };

  const platformBarOption: EChartsOption = {
    xAxis: {
      type: "category",
      data: (metrics?.platformDist ?? []).map((r) => r.platform),
      axisLabel: { color: "#949BA4" },
      axisLine: { lineStyle: { color: "#3F4147" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#949BA4" },
      splitLine: { lineStyle: { color: "#3F4147" } },
    },
    series: [
      {
        type: "bar",
        data: (metrics?.platformDist ?? []).map((r) => ({
          value: r.count,
          itemStyle: {
            color:
              PLATFORM_CONFIG[r.platform as keyof typeof PLATFORM_CONFIG]
                ?.color ?? "#949BA4",
          },
        })),
      },
    ],
    tooltip: { trigger: "axis" },
  };

  const trendLineOption: EChartsOption = {
    xAxis: {
      type: "category",
      data: (trend ?? []).map((d) => d.date),
      axisLabel: { color: "#949BA4", rotate: 30 },
      axisLine: { lineStyle: { color: "#3F4147" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#949BA4" },
      splitLine: { lineStyle: { color: "#3F4147" } },
    },
    series: [
      {
        type: "line",
        data: (trend ?? []).map((d) => d.count),
        smooth: true,
        lineStyle: { color: "#E32C19" },
        areaStyle: { color: "rgba(227,44,25,0.1)" },
      },
    ],
    tooltip: { trigger: "axis" },
  };

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total Users" value={metrics?.totalUsers ?? 0} />
        <KpiCard label="Total Creators" value={metrics?.totalCreators ?? 0} />
        <KpiCard label="Snapshots (24h)" value={metrics?.snapshots24h ?? 0} />
        <KpiCard label="Total Games" value={metrics?.totalGames ?? 0} />
        <KpiCard label="Leads (7d)" value={metrics?.leads7d ?? 0} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-[#F2F3F5]">
            Creators by State
          </h3>
          <BaseChart option={stateDonutOption} className="h-48" />
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-[#F2F3F5]">
            Creators by Tier
          </h3>
          <BaseChart option={tierDonutOption} className="h-48" />
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-[#F2F3F5]">
            Platform Distribution
          </h3>
          <BaseChart option={platformBarOption} className="h-48" />
        </Card>
      </div>

      {/* Snapshot trend */}
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-[#F2F3F5]">
          Snapshot Activity (30 days)
        </h3>
        <BaseChart option={trendLineOption} className="h-56" />
      </Card>
    </div>
  );
}
