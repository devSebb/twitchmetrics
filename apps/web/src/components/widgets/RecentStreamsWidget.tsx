"use client";
import { WidgetQueryError } from "./WidgetQueryError";

import { useState, useCallback } from "react";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { trpc } from "@/lib/trpc";
import { formatDate, formatDuration, formatNumber } from "@/lib/utils/format";
import { EmptyWidgetSentinel } from "@/components/dashboard/WidgetCard";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

type SortBy = "date" | "game" | "duration" | "avgViewers" | "peakViewers";
type SortOrder = "asc" | "desc";

type Props = {
  profile: SerializedProfile;
};

const COLUMNS = [
  { key: "date", label: "Date" },
  { key: "platform", label: "Platform", sortable: false },
  { key: "game", label: "Game / Category" },
  { key: "duration", label: "Duration" },
  { key: "avgViewers", label: "Avg Viewers" },
  { key: "peakViewers", label: "Peak Viewers" },
].map((column) => ({ sortable: true, ...column })) as {
  key: SortBy | "platform";
  label: string;
  sortable: boolean;
}[];

function SortArrow({ active, order }: { active: boolean; order: SortOrder }) {
  if (!active) return null;
  return (
    <span className="ml-1 text-n-slate">{order === "asc" ? "▲" : "▼"}</span>
  );
}

/** A measured viewer figure, or a dash when we have none for this stream. */
function ViewerCount({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="text-n-slate" title="No viewer data for this stream">
        &mdash;
      </span>
    );
  }
  return <>{formatNumber(value)}</>;
}

export function RecentStreamsWidget({ profile }: Props) {
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } =
    trpc.snapshot.getRecentStreams.useQuery({
      creatorProfileId: profile.id,
      page,
      pageSize: 10,
      sortBy,
      sortOrder,
    });

  const handleSort = useCallback(
    (col: SortBy | "platform") => {
      if (col === "platform") return;
      if (col === sortBy) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(col);
        setSortOrder("desc");
      }
      setPage(1);
    },
    [sortBy],
  );

  if (isError)
    return (
      <WidgetQueryError label="recent streams" onRetry={() => void refetch()} />
    );

  if (isLoading) {
    return (
      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-n-surface" />
        ))}
      </div>
    );
  }

  if (!data || data.sessions.length === 0) {
    return <EmptyWidgetSentinel />;
  }

  const totalPages = Math.ceil(data.total / 10);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div
        className="flex-1 min-h-0 overflow-auto"
        role="region"
        aria-label="Recent streams"
        tabIndex={0}
      >
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-n-canvas">
            <tr className="border-b border-n-line">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 text-xs font-medium text-n-slate transition-colors ${
                    col.sortable ? "cursor-pointer hover:text-n-ink" : ""
                  }`}
                  aria-sort={
                    col.sortable && sortBy === col.key
                      ? sortOrder === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className="inline-flex items-center py-1 text-left"
                    >
                      {col.label}
                      <SortArrow
                        active={sortBy === col.key}
                        order={sortOrder}
                      />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.sessions.map((session, i) => (
              <tr
                key={i}
                className="border-b border-n-line transition-colors hover:bg-n-surface"
              >
                <td className="px-3 py-2.5 text-n-ink">
                  {formatDate(session.startedAt)}
                </td>
                <td className="px-3 py-2.5 text-n-ink">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          PLATFORM_CONFIG[session.platform].color,
                      }}
                    />
                    {PLATFORM_CONFIG[session.platform].name}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-n-ink">
                  {session.game ?? (
                    <span className="text-n-slate">&mdash;</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-n-ink">
                  {formatDuration(session.durationMinutes * 60)}
                </td>
                <td className="px-3 py-2.5 text-n-ink">
                  {session.viewerData === "processing" ? (
                    <span
                      className="rounded bg-n-surface px-1.5 py-0.5 text-[10px] font-medium text-n-slate"
                      title="Viewer stats arrive with Stream Hatchet's daily data, usually by the next morning (UTC)."
                    >
                      Processing
                    </span>
                  ) : (
                    <ViewerCount value={session.avgViewers} />
                  )}
                </td>
                <td className="px-3 py-2.5 text-n-ink">
                  <ViewerCount value={session.peakViewers} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-3 flex shrink-0 items-center justify-between">
          <span className="text-xs text-n-slate">
            Page {data.page} of {totalPages} ({data.total} streams)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-n-line px-3 py-1 text-xs text-n-ink transition-colors hover:bg-n-surface disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-n-line px-3 py-1 text-xs text-n-ink transition-colors hover:bg-n-surface disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
