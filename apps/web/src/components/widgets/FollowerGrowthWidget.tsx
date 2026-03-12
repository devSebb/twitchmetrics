"use client";

import { useState, useMemo } from "react";
import type { Platform } from "@twitchmetrics/database";
import { FollowerGrowthChart } from "@/components/charts";
import { CHART_PLATFORM_COLORS } from "@/components/charts/theme";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { EmptyState } from "@/components/widgets/EmptyState";
import { trpc } from "@/lib/trpc";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

type FollowerGrowthWidgetProps = {
  profile: SerializedProfile;
};

export function FollowerGrowthWidget({ profile }: FollowerGrowthWidgetProps) {
  const connectedPlatforms = useMemo(
    () => profile.platformAccounts.map((a) => a.platform),
    [profile.platformAccounts],
  );

  const [platform, setPlatform] = useState<Platform | "all">(
    connectedPlatforms[0] ?? "twitch",
  );
  const [period, setPeriod] = useState("30d");

  // Fetch data for selected platform (or primary when "all")
  const primaryQuery = trpc.snapshot.getGrowthData.useQuery(
    {
      creatorProfileId: profile.id,
      platform: platform === "all" ? connectedPlatforms[0]! : platform,
      period: period as "7d" | "30d" | "90d" | "1y" | "all",
    },
    { enabled: connectedPlatforms.length > 0 && platform !== "all" },
  );

  // For "all" mode, fetch each connected platform
  const allQueries = connectedPlatforms.map((p) =>
    trpc.snapshot.getGrowthData.useQuery(
      {
        creatorProfileId: profile.id,
        platform: p,
        period: period as "7d" | "30d" | "90d" | "1y" | "all",
      },
      { enabled: platform === "all" },
    ),
  );

  // Transform snapshot data → chart format
  const chartData = useMemo(() => {
    if (platform !== "all" && primaryQuery.data) {
      return primaryQuery.data.map((s) => ({
        date: new Date(s.snapshotAt).toISOString(),
        value: s.followerCount?.toString() ?? "0",
      }));
    }
    return [];
  }, [platform, primaryQuery.data]);

  const isLoading =
    platform === "all"
      ? allQueries.some((q) => q.isLoading)
      : primaryQuery.isLoading;

  if (connectedPlatforms.length === 0) {
    return (
      <EmptyState
        variant="no_data"
        title="No follower data"
        message="No platform accounts connected yet."
        compact
      />
    );
  }

  if (!isLoading && chartData.length === 0 && platform !== "all") {
    return (
      <EmptyState
        variant="no_data"
        title="No follower data"
        message="No follower data available yet. Data will appear after the next snapshot."
        compact
      />
    );
  }

  return (
    <div>
      {/* Platform tabs */}
      <div className="mb-3 flex items-center gap-1">
        {connectedPlatforms.length > 1 && (
          <button
            onClick={() => setPlatform("all")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              platform === "all"
                ? "bg-[#383A40] text-[#F2F3F5]"
                : "text-[#949BA4] hover:bg-[#383A40] hover:text-[#DBDEE1]"
            }`}
          >
            All
          </button>
        )}
        {connectedPlatforms.map((p) => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              platform === p
                ? "bg-[#383A40] text-[#F2F3F5]"
                : "text-[#949BA4] hover:bg-[#383A40] hover:text-[#DBDEE1]"
            }`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  CHART_PLATFORM_COLORS[p] ?? PLATFORM_CONFIG[p].color,
              }}
            />
            {PLATFORM_CONFIG[p].name}
          </button>
        ))}
      </div>

      {/* Chart */}
      {platform === "all" ? (
        <AllPlatformsChart
          profiles={connectedPlatforms}
          queries={allQueries}
          period={period}
          onPeriodChange={setPeriod}
        />
      ) : (
        <FollowerGrowthChart
          data={chartData}
          platform={platform}
          period={period}
          onPeriodChange={setPeriod}
          loading={isLoading}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Multi-platform overlay chart for "All" tab
// ----------------------------------------------------------------

import { BaseChart } from "@/components/charts";
import { formatNumber, formatDate } from "@/lib/utils/format";
import type { EChartsOption } from "echarts";

type AllPlatformsChartProps = {
  profiles: Platform[];
  queries: ReturnType<typeof trpc.snapshot.getGrowthData.useQuery>[];
  period: string;
  onPeriodChange: (p: string) => void;
};

const PERIODS = ["7d", "30d", "90d", "1y", "all"] as const;

function AllPlatformsChart({
  profiles,
  queries,
  period,
  onPeriodChange,
}: AllPlatformsChartProps) {
  const isLoading = queries.some((q) => q.isLoading);

  const option = useMemo((): EChartsOption => {
    // Collect all unique dates across platforms
    const allDates = new Set<string>();
    const platformData: Record<string, Map<string, number>> = {};

    profiles.forEach((p, i) => {
      const rawData = queries[i]?.data;
      if (!rawData || !Array.isArray(rawData)) return;
      const data = rawData as {
        snapshotAt: Date;
        followerCount: bigint | null;
      }[];
      const map = new Map<string, number>();
      data.forEach((s) => {
        const dateKey = new Date(s.snapshotAt).toISOString().split("T")[0]!;
        allDates.add(dateKey);
        map.set(dateKey, Number(s.followerCount ?? 0));
      });
      platformData[p] = map;
    });

    const sortedDates = [...allDates].sort();
    if (sortedDates.length === 0) return { series: [] };

    const series = profiles.map((p) => {
      const map = platformData[p];
      const color = CHART_PLATFORM_COLORS[p] ?? PLATFORM_CONFIG[p].color;
      return {
        type: "line" as const,
        name: PLATFORM_CONFIG[p].name,
        data: sortedDates.map((d) => map?.get(d) ?? null),
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
              { offset: 0, color: color + "20" },
              { offset: 1, color: color + "00" },
            ],
          },
        },
        connectNulls: true,
      };
    });

    return {
      grid: { left: 60, right: 20, top: 30, bottom: 60 },
      legend: {
        show: true,
        top: 0,
        textStyle: { color: "#949BA4", fontSize: 11 },
      },
      xAxis: {
        type: "category",
        data: sortedDates,
        axisLabel: { formatter: (val: string) => formatDate(val, "compact") },
        boundaryGap: false,
      },
      yAxis: {
        type: "value",
        axisLabel: { formatter: (val: number) => formatNumber(val) },
        splitNumber: 4,
      },
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const first = arr[0] as { axisValue: string };
          let html = `<div style="font-size:13px"><div style="margin-bottom:4px;color:#949BA4">${formatDate(first.axisValue)}</div>`;
          for (const item of arr as {
            seriesName: string;
            value: number | null;
            color: string;
          }[]) {
            if (item.value !== null) {
              html += `<div><span style="color:${item.color}">●</span> ${item.seriesName}: <b>${formatNumber(item.value)}</b></div>`;
            }
          }
          html += "</div>";
          return html;
        },
      },
      dataZoom: [{ type: "slider", start: 0, end: 100, height: 24, bottom: 8 }],
      series,
    };
  }, [profiles, queries]);

  return (
    <div>
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
      <BaseChart option={option} height={400} loading={isLoading} />
    </div>
  );
}
