"use client";

import type { EChartsOption } from "echarts";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { formatNumber } from "@/lib/utils/format";
import { BaseChart } from "@/components/charts/BaseChart";
import { EmptyState } from "./EmptyState";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

type Props = {
  profile: SerializedProfile;
};

export function PlatformBreakdownWidget({ profile }: Props) {
  const bars = profile.platformAccounts
    .filter((a) => a.followerCount !== null && Number(a.followerCount) > 0)
    .map((a) => ({
      platform: a.platform,
      followerCount: Number(a.followerCount),
      color: PLATFORM_CONFIG[a.platform].color,
      name: PLATFORM_CONFIG[a.platform].name,
    }))
    .sort((a, b) => b.followerCount - a.followerCount);

  if (bars.length === 0) {
    return (
      <EmptyState
        variant="no_data"
        title="No Data"
        message="No follower data available yet."
        compact
      />
    );
  }

  const option: EChartsOption = {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const p = Array.isArray(params) ? params[0] : params;
        const item = p as { name: string; value: number };
        return `${item.name}: ${formatNumber(item.value)}`;
      },
    },
    grid: { left: 80, right: 20, top: 10, bottom: 10, containLabel: false },
    xAxis: {
      type: "value",
      show: false,
    },
    yAxis: {
      type: "category",
      data: bars.map((b) => b.name),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        data: bars.map((b) => ({
          value: b.followerCount,
          itemStyle: { color: b.color },
        })),
        barMaxWidth: 24,
        label: {
          show: true,
          position: "right",
          formatter: (params) => {
            const val = Array.isArray(params.value)
              ? Number(params.value[0])
              : Number(params.value ?? 0);
            return formatNumber(val);
          },
          color: "#949BA4",
          fontSize: 11,
        },
      },
    ],
  };

  return (
    <div>
      <BaseChart option={option} height={Math.max(bars.length * 48, 120)} />
      {bars.length === 1 && (
        <p className="mt-2 text-center text-xs text-[#949BA4]">
          Connect more platforms to compare.
        </p>
      )}
    </div>
  );
}
