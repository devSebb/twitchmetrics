"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, Skeleton } from "@/components/ui";

export function AuditLogViewer() {
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 50;

  const { data, isLoading } = trpc.admin.getAuditLog.useQuery({
    action: actionFilter || undefined,
    targetType: targetTypeFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by action..."
          className="flex-1 rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] outline-none focus:border-[#4E5058]"
        />
        <input
          type="text"
          value={targetTypeFilter}
          onChange={(e) => {
            setTargetTypeFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Target type..."
          className="w-40 rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] outline-none focus:border-[#4E5058]"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] outline-none"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] outline-none"
        />
      </div>

      <div className="text-xs text-[#949BA4]">{total} entries</div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="text-sm text-[#949BA4]">
            No audit log entries match your filters.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#3F4147]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#3F4147] bg-[#2B2D31]">
              <tr>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  User
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Action
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Target
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3F4147] bg-[#313338]">
              {items.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    className="cursor-pointer hover:bg-[#383A40]/50"
                    onClick={() =>
                      setExpandedId(expandedId === entry.id ? null : entry.id)
                    }
                  >
                    <td className="px-4 py-3 text-xs text-[#949BA4]">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-[#F2F3F5]">
                        {entry.user.name ?? "—"}
                      </p>
                      <p className="text-xs text-[#949BA4]">
                        {entry.user.email ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-[#2B2D31] px-1.5 py-0.5 text-xs text-[#93c5fd]">
                        {entry.action}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#949BA4]">
                      {entry.targetType ? (
                        <span>
                          {entry.targetType}
                          {entry.targetId ? (
                            <span className="ml-1 text-[#949BA4]">
                              ({entry.targetId.slice(0, 8)}…)
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#949BA4]">
                      {entry.metadata ? (
                        <span className="text-[#DBDEE1]">
                          {expandedId === entry.id ? "▲" : "▼"} expand
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  {expandedId === entry.id && entry.metadata && (
                    <tr key={`${entry.id}-expanded`} className="bg-[#2B2D31]">
                      <td colSpan={5} className="px-4 py-3">
                        <pre className="overflow-x-auto rounded bg-[#1E1F22] p-3 text-xs text-[#DBDEE1]">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((v) => Math.max(1, v - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <p className="text-sm text-[#949BA4]">
          Page {page} of {pageCount}
        </p>
        <button
          type="button"
          onClick={() => setPage((v) => Math.min(pageCount, v + 1))}
          disabled={page >= pageCount}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
