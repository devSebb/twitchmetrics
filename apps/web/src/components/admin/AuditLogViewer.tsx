"use client";

import { Fragment, useState } from "react";
import { QueryError } from "@/components/ui/QueryError";
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

  const { data, isLoading, isError, refetch } = trpc.admin.getAuditLog.useQuery(
    {
      action: actionFilter || undefined,
      targetType: targetTypeFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      limit,
    },
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          aria-label="Filter by action"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by action..."
          className="min-w-0 basis-full sm:basis-auto flex-1 rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink outline-none focus:border-n-control"
        />
        <input
          type="text"
          aria-label="Filter by target type"
          value={targetTypeFilter}
          onChange={(e) => {
            setTargetTypeFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Target type..."
          className="w-40 rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink outline-none focus:border-n-control"
        />
        <input
          type="date"
          aria-label="From date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink outline-none"
        />
        <input
          type="date"
          aria-label="To date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink outline-none"
        />
      </div>

      <div className="text-xs text-n-slate">{total} entries</div>

      {isError ? (
        <QueryError label="the audit log" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="text-sm text-n-slate">
            No audit log entries match your filters.
          </p>
        </Card>
      ) : (
        <div
          role="region"
          aria-label="The audit log table"
          tabIndex={0}
          className="overflow-x-auto border-y border-n-line"
        >
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">The audit log</caption>
            <thead className="border-b border-n-line bg-n-surface">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Timestamp
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  User
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Action
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Target
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-n-line bg-white">
              {items.map((entry) => (
                <Fragment key={entry.id}>
                  <tr key={entry.id} className="hover:bg-n-surface/50">
                    <td className="px-4 py-3 text-xs text-n-slate">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-n-ink">
                        {entry.user.name ?? "—"}
                      </p>
                      <p className="text-xs text-n-slate">
                        {entry.user.email ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-n-surface px-1.5 py-0.5 text-xs text-n-navy">
                        {entry.action}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-xs text-n-slate">
                      {entry.targetType ? (
                        <span>
                          {entry.targetType}
                          {entry.targetId ? (
                            <span className="ml-1 text-n-slate">
                              ({entry.targetId.slice(0, 8)}…)
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-n-slate">
                      {entry.metadata ? (
                        <button
                          type="button"
                          aria-expanded={expandedId === entry.id}
                          aria-controls={`audit-${entry.id}`}
                          aria-label={`Details for ${entry.action}`}
                          onClick={() =>
                            setExpandedId(
                              expandedId === entry.id ? null : entry.id,
                            )
                          }
                          className="text-n-ink underline"
                        >
                          {expandedId === entry.id ? "Hide" : "View"} details
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  {expandedId === entry.id && entry.metadata && (
                    <tr key={`${entry.id}-expanded`} className="bg-n-surface">
                      <td colSpan={5} className="px-4 py-3">
                        <pre
                          id={`audit-${entry.id}`}
                          className="overflow-x-auto rounded bg-white p-3 text-xs text-n-ink"
                        >
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setPage((v) => Math.max(1, v - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <p className="text-sm text-n-slate">
          Page {page} of {pageCount}
        </p>
        <button
          type="button"
          onClick={() => setPage((v) => Math.min(pageCount, v + 1))}
          disabled={page >= pageCount}
          className="rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
