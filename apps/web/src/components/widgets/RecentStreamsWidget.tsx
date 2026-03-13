"use client";

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { formatDate, formatDuration, formatNumber } from "@/lib/utils/format";
import { EmptyState } from "./EmptyState";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

type SortBy = "date" | "game" | "duration" | "avgViewers" | "peakViewers";
type SortOrder = "asc" | "desc";

type Props = {
  profile: SerializedProfile;
};

const COLUMNS: { key: SortBy; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "game", label: "Game / Category" },
  { key: "duration", label: "Duration" },
  { key: "avgViewers", label: "Avg Viewers" },
  { key: "peakViewers", label: "Peak Viewers" },
];

function SortArrow({ active, order }: { active: boolean; order: SortOrder }) {
  if (!active) return null;
  return (
    <span className="ml-1 text-[#949BA4]">{order === "asc" ? "▲" : "▼"}</span>
  );
}

export function RecentStreamsWidget({ profile }: Props) {
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.snapshot.getRecentStreams.useQuery({
    creatorProfileId: profile.id,
    page,
    pageSize: 10,
    sortBy,
    sortOrder,
  });

  const handleSort = useCallback(
    (col: SortBy) => {
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

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-[#383A40]" />
        ))}
      </div>
    );
  }

  if (!data || data.sessions.length === 0) {
    return (
      <EmptyState
        variant="no_data"
        title="No Streams"
        message="No stream history available."
        compact
      />
    );
  }

  const totalPages = Math.ceil(data.total / 10);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#3F4147]">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="cursor-pointer px-3 py-2 text-xs font-medium text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <SortArrow active={sortBy === col.key} order={sortOrder} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.sessions.map((session, i) => (
              <tr
                key={i}
                className="border-b border-[#3F4147]/50 transition-colors hover:bg-[#383A40]"
              >
                <td className="px-3 py-2.5 text-[#DBDEE1]">
                  {formatDate(session.startedAt)}
                </td>
                <td className="px-3 py-2.5 text-[#DBDEE1]">
                  {session.game ?? (
                    <span className="text-[#949BA4]">&mdash;</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[#DBDEE1]">
                  {formatDuration(session.durationMinutes * 60)}
                </td>
                <td className="px-3 py-2.5 text-[#DBDEE1]">
                  {formatNumber(session.avgViewers)}
                </td>
                <td className="px-3 py-2.5 text-[#DBDEE1]">
                  {formatNumber(session.peakViewers)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-[#949BA4]">
            Page {data.page} of {totalPages} ({data.total} streams)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-[#3F4147] px-3 py-1 text-xs text-[#DBDEE1] transition-colors hover:bg-[#383A40] disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-[#3F4147] px-3 py-1 text-xs text-[#DBDEE1] transition-colors hover:bg-[#383A40] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
