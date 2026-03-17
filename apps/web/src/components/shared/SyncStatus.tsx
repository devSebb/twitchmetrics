"use client";

/**
 * Inline time-ago formatter (no date-fns dependency).
 */
function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

type SyncStatusProps = {
  lastSyncedAt: string | Date | null;
};

export function SyncStatus({ lastSyncedAt }: SyncStatusProps) {
  if (!lastSyncedAt) {
    return <span className="text-xs text-[#8B8E94]">No data yet</span>;
  }

  const date =
    typeof lastSyncedAt === "string" ? new Date(lastSyncedAt) : lastSyncedAt;
  const hoursAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60);

  let colorClass = "text-[#8B8E94]"; // Default muted gray
  let label = `Updated ${timeAgo(date)}`;

  if (hoursAgo > 168) {
    // > 7 days
    colorClass = "text-red-400";
    label = `Data outdated — last updated ${timeAgo(date)}`;
  } else if (hoursAgo > 24) {
    colorClass = "text-yellow-400";
    label = `Data may be outdated — updated ${timeAgo(date)}`;
  }

  return (
    <span className={`flex items-center gap-1 text-xs ${colorClass}`}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
