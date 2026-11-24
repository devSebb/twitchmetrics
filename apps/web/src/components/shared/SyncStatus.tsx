"use client";

import { getMetricFreshness } from "@/lib/metric-freshness";

type SyncStatusProps = {
  lastSyncedAt: string | Date | null;
  inverted?: boolean;
};

export function SyncStatus({
  lastSyncedAt,
  inverted = false,
}: SyncStatusProps) {
  const mutedClass = inverted ? "text-white/75" : "text-n-slate";
  if (!lastSyncedAt) {
    return (
      <span className={`text-xs ${mutedClass}`}>
        Latest snapshot unavailable
      </span>
    );
  }

  const date =
    typeof lastSyncedAt === "string" ? new Date(lastSyncedAt) : lastSyncedAt;
  const freshness = getMetricFreshness(date);
  if (!freshness) {
    return (
      <span className={`text-xs ${mutedClass}`}>
        Latest snapshot unavailable
      </span>
    );
  }

  const colorClass =
    freshness.state === "outdated"
      ? inverted
        ? "text-red-300"
        : "text-n-error"
      : freshness.state === "possibly_outdated"
        ? inverted
          ? "text-amber-200"
          : "text-n-warning"
        : mutedClass;
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
