"use client";

import type { EChartsOption } from "echarts";
import { trpc } from "@/lib/trpc";
import { BaseChart } from "@/components/charts/BaseChart";
import { EmptyState } from "./EmptyState";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

type Props = {
  profile: SerializedProfile;
  isClaimed: boolean;
};

type BrandSafetyData = {
  brand_safety_score: number;
  brand_safety_rating: "safe" | "moderate" | "review";
  brand_safety_source: string;
};

function getRatingColor(rating: string): string {
  switch (rating) {
    case "safe":
      return "#22c55e";
    case "moderate":
      return "#f59e0b";
    case "review":
      return "#ef4444";
    default:
      return "#949BA4";
  }
}

function getRatingLabel(rating: string): string {
  switch (rating) {
    case "safe":
      return "Safe";
    case "moderate":
      return "Moderate";
    case "review":
      return "Review";
    default:
      return "Unknown";
  }
}

export function BrandSafetyWidget({ profile, isClaimed }: Props) {
  // Fetch the latest metric snapshot that might have brand safety data
  const { data, isLoading } = trpc.snapshot.getLatestMetrics.useQuery({
    creatorProfileId: profile.id,
  });

  if (isLoading) {
    return (
      <div className="flex h-48 animate-pulse items-center justify-center rounded-lg bg-[#383A40]">
        <span className="text-sm text-[#949BA4]">Loading...</span>
      </div>
    );
  }

  // Extract brand safety from extendedMetrics
  const ext = data?.snapshot?.extendedMetrics as Record<string, unknown> | null;
  const safetyData =
    ext &&
    typeof ext.brand_safety_score === "number" &&
    typeof ext.brand_safety_rating === "string"
      ? (ext as unknown as BrandSafetyData)
      : null;

  if (!safetyData) {
    return (
      <EmptyState
        variant="no_data"
        title="Not Rated"
        message="Brand safety rating not yet available."
        compact
      />
    );
  }

  const score = safetyData.brand_safety_score;
  const rating = safetyData.brand_safety_rating;
  const color = getRatingColor(rating);

  const gaugeOption: EChartsOption = {
    series: [
      {
        type: "gauge",
        startAngle: 180,
        endAngle: 0,
        min: 0,
        max: 100,
        splitNumber: 10,
        radius: "100%",
        center: ["50%", "75%"],
        axisLine: {
          lineStyle: {
            width: 14,
            color: [
              [0.4, "#ef4444"],
              [0.7, "#f59e0b"],
              [1, "#22c55e"],
            ],
          },
        },
        pointer: {
          length: "60%",
          width: 4,
          itemStyle: { color },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: {
          valueAnimation: true,
          formatter: `{value}`,
          color,
          fontSize: 24,
          fontWeight: "bold",
          offsetCenter: [0, "-10%"],
        },
        data: [{ value: score }],
      },
    ],
  };

  return (
    <div className="flex flex-col items-center">
      {/* Rating badge */}
      <span
        className="mb-2 rounded-full px-3 py-1 text-xs font-bold uppercase text-white"
        style={{ backgroundColor: color }}
      >
        {getRatingLabel(rating)}
      </span>

      {/* Gauge chart */}
      <BaseChart option={gaugeOption} height={160} />

      {/* Source label */}
      <p className="mt-1 text-[10px] text-[#949BA4]">
        Source: {safetyData.brand_safety_source ?? "Manual review"}
      </p>
    </div>
  );
}
