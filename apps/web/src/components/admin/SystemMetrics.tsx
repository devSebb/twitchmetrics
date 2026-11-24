"use client";

import { QueryError } from "@/components/ui/QueryError";
import { trpc } from "@/lib/trpc";
import { Card, Skeleton } from "@/components/ui";
import { BaseChart } from "@/components/charts/BaseChart";
import type { EChartsOption } from "echarts";
import { NOTICED, NOTICED_CHART_COLORS } from "@/lib/constants/noticed";

const STATE_COLORS: Record<string, string> = {
  unclaimed: NOTICED.slate,
  pending_claim: NOTICED.warning,
  claimed: NOTICED.success,
  premium: NOTICED.navy,
};

const TIER_COLORS: Record<string, string> = {
  tier1: NOTICED.warning,
  tier2: NOTICED.navy,
  tier3: NOTICED.slate,
};

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-t border-n-line py-5">
      <p className="break-words text-3xl font-bold text-n-ink">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-n-slate">{label}</p>
    </div>
  );
}

export function SystemMetrics() {
  const {
    data: metrics,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch: retryMetrics,
  } = trpc.admin.getSystemMetrics.useQuery();
  const {
    data: trend,
    isLoading: trendLoading,
    isError: trendError,
    refetch: retryTrend,
  } = trpc.admin.getSnapshotTrend.useQuery({ days: 30 });

  if (metricsLoading || trendLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (metricsError || trendError)
    return (
      <QueryError
        label="system metrics"
        onRetry={() => {
          void retryMetrics();
          void retryTrend();
        }}
      />
    );

  const stateDonutOption: EChartsOption = {
    series: [
      {
        type: "pie",
        radius: ["35%", "60%"],
        center: ["50%", "42%"],
        data: (metrics?.creatorsByState ?? []).map((r) => ({
          name: r.state,
          value: r.count,
          itemStyle: { color: STATE_COLORS[r.state] ?? NOTICED.slate },
        })),
        label: { show: false },
      },
    ],
    legend: {
      type: "scroll",
      bottom: 0,
      textStyle: { color: NOTICED.ink },
    },
    tooltip: { trigger: "item" },
  };

  const tierDonutOption: EChartsOption = {
    series: [
      {
        type: "pie",
        radius: ["35%", "60%"],
        center: ["50%", "42%"],
        data: (metrics?.creatorsByTier ?? []).map((r) => ({
          name: r.tier,
          value: r.count,
          itemStyle: { color: TIER_COLORS[r.tier] ?? NOTICED.slate },
        })),
        label: { show: false },
      },
    ],
    legend: {
      type: "scroll",
      bottom: 0,
      textStyle: { color: NOTICED.ink },
    },
    tooltip: { trigger: "item" },
  };

  const platformBarOption: EChartsOption = {
    xAxis: {
      type: "category",
      data: (metrics?.platformDist ?? []).map((r) => r.platform),
      axisLabel: { color: NOTICED.slate },
      axisLine: { lineStyle: { color: NOTICED.line } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: NOTICED.slate },
      splitLine: { lineStyle: { color: NOTICED.line } },
    },
    series: [
      {
        type: "bar",
        data: (metrics?.platformDist ?? []).map((r) => ({
          value: r.count,
          itemStyle: {
            color:
              NOTICED_CHART_COLORS[
                r.platform as keyof typeof NOTICED_CHART_COLORS
              ] ?? NOTICED.slate,
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
      axisLabel: { color: NOTICED.slate, rotate: 30 },
      axisLine: { lineStyle: { color: NOTICED.line } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: NOTICED.slate },
      splitLine: { lineStyle: { color: NOTICED.line } },
    },
    series: [
      {
        type: "line",
        data: (trend ?? []).map((d) => d.count),
        smooth: true,
        lineStyle: { color: NOTICED.red },
        areaStyle: { color: "rgba(196,38,44,0.1)" },
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
          <h3 className="mb-2 text-sm font-semibold text-n-ink">
            Creators by State
          </h3>
          <BaseChart option={stateDonutOption} className="h-48" />
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-n-ink">
            Creators by Tier
          </h3>
          <BaseChart option={tierDonutOption} className="h-48" />
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-n-ink">
            Platform Distribution
          </h3>
          <BaseChart option={platformBarOption} className="h-48" />
        </Card>
      </div>

      {/* Snapshot trend */}
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-n-ink">
          Snapshot Activity (30 days)
        </h3>
        <BaseChart option={trendLineOption} className="h-56" />
      </Card>
    </div>
  );
}
