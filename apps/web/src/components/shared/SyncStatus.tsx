"use client";

import { getMetricFreshness } from "@/lib/metric-freshness";

type SyncStatusProps = {
  lastSyncedAt: string | Date | null;
};

export function SyncStatus({ lastSyncedAt }: SyncStatusProps) {
  if (!lastSyncedAt) {
    return (
      <span className="text-xs text-[#8B8E94]">
        Latest snapshot unavailable
      </span>
    );
  }

  const date =
    typeof lastSyncedAt === "string" ? new Date(lastSyncedAt) : lastSyncedAt;
  const freshness = getMetricFreshness(date);
  if (!freshness) {
    return (
      <span className="text-xs text-[#8B8E94]">
        Latest snapshot unavailable
      </span>
    );
  }

  const colorClass =
    freshness.state === "outdated"
      ? "text-red-400"
      : freshness.state === "possibly_outdated"
        ? "text-yellow-400"
        : "text-[#8B8E94]";
  const qualifier =
    freshness.state === "outdated"
      ? " · Outdated"
      : freshness.state === "possibly_outdated"
        ? " · May be outdated"
        : "";

  return (
    <span
      className={`flex items-center gap-1 text-xs ${colorClass}`}
      title={`Latest snapshot: ${date.toLocaleString()}`}
      suppressHydrationWarning
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      Latest · Updated {freshness.relativeTime}
      {qualifier}
    </span>
  );
}
