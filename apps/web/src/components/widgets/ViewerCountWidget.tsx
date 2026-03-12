"use client";

import { useState, useMemo } from "react";
import type { Platform } from "@twitchmetrics/database";
import { ViewerCountChart } from "@/components/charts";
import { EmptyState } from "@/components/widgets/EmptyState";
import { trpc } from "@/lib/trpc";
import { formatNumber } from "@/lib/utils/format";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

type ViewerCountWidgetProps = {
  profile: SerializedProfile;
};

const PERIODS = ["7d", "30d", "90d"] as const;

export function ViewerCountWidget({ profile }: ViewerCountWidgetProps) {
  const primaryPlatform = profile.primaryPlatform;
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30d");

  const { data: snapshotData, isLoading } =
    trpc.snapshot.getGrowthData.useQuery({
      creatorProfileId: profile.id,
      platform: primaryPlatform,
      period,
    });

  // Extract viewer data from extendedMetrics
  const chartData = useMemo(() => {
    if (!snapshotData) return [];

    return snapshotData
      .map((s) => {
        const ext = s.extendedMetrics as Record<string, unknown> | null;
        const viewers =
          typeof ext?.avgViewers === "number"
            ? ext.avgViewers
            : typeof ext?.liveViewerCount === "number"
              ? ext.liveViewerCount
              : null;

        if (viewers === null) return null;

        const game =
          typeof ext?.currentGame === "string" ? ext.currentGame : undefined;
        return game !== undefined
          ? { date: new Date(s.snapshotAt).toISOString(), viewers, game }
          : { date: new Date(s.snapshotAt).toISOString(), viewers };
      })
      .filter(
        (d): d is { date: string; viewers: number; game?: string } =>
          d !== null,
      );
  }, [snapshotData]);

  // Check if currently live (from latest snapshot)
  const liveInfo = useMemo(() => {
    if (!snapshotData || snapshotData.length === 0) return null;

    const latest = snapshotData[snapshotData.length - 1];
    const ext = latest?.extendedMetrics as Record<string, unknown> | null;
    if (!ext) return null;

    const isLive = ext.isLive === true;
    const currentViewers =
      typeof ext.liveViewerCount === "number" ? ext.liveViewerCount : null;

    if (!isLive) return null;
    return { viewers: currentViewers };
  }, [snapshotData]);

  if (!isLoading && chartData.length === 0) {
    return (
      <EmptyState
        variant="no_data"
        title="No viewer data"
        message="No viewer data available. Data will appear after streams are recorded."
        compact
      />
    );
  }

  return (
    <div>
      {/* Header row with live indicator + period selector */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {liveInfo && (
            <div className="flex items-center gap-1.5 rounded-full bg-[#ef4444]/20 px-2.5 py-0.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ef4444] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ef4444]" />
              </span>
              <span className="text-xs font-semibold text-[#ef4444]">LIVE</span>
              {liveInfo.viewers !== null && (
                <span className="text-xs font-medium text-[#F2F3F5]">
                  {formatNumber(liveInfo.viewers)}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-[#383A40] text-[#F2F3F5]"
                  : "text-[#949BA4] hover:bg-[#383A40] hover:text-[#DBDEE1]"
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <ViewerCountChart
        data={chartData}
        platform={primaryPlatform}
        loading={isLoading}
        height={320}
      />
    </div>
  );
}
