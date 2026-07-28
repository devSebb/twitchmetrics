"use client";

import { useState } from "react";
import { ViewerCountChart } from "@/components/charts";
import { EmptyWidgetSentinel } from "@/components/dashboard/WidgetCard";
import { SyncStatus } from "@/components/shared";
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
  // After the viewer touches the period selector, keep the widget visible even
  // when the new period has no data — the sentinel would hide the whole card
  // mid-interaction. The chart shows its own inline empty state instead.
  const [hasInteracted, setHasInteracted] = useState(false);

  // Server-side viewer extraction: MetricSnapshots when available, with a
  // StreamHatchet daily-rollup fallback for platforms that aren't API-polled
  // (e.g. the SH kick catalog).
  const { data, isLoading } = trpc.snapshot.getViewerHistory.useQuery({
    creatorProfileId: profile.id,
    platform: primaryPlatform,
    period,
  });

  const chartData = data?.points ?? [];
  const liveInfo = data?.liveInfo ?? null;
  const latestSnapshotAt = data?.latestAt ?? null;

  if (!isLoading && chartData.length === 0 && !hasInteracted) {
    return <EmptyWidgetSentinel />;
  }

  return (
    <div>
      {/* Header row with verified status, freshness, and period selector */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
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
          <SyncStatus lastSyncedAt={latestSnapshotAt} />
        </div>

        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setHasInteracted(true);
                setPeriod(p);
              }}
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
