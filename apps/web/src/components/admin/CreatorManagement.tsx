"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { QueryError } from "@/components/ui/QueryError";
import { trpc } from "@/lib/trpc";
import { Badge, Button, Card, Skeleton } from "@/components/ui";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { formatNumber, formatRelativeTime } from "@/lib/utils/format";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { getSafeImageSrc } from "@/lib/safeImage";

const STATE_OPTIONS = [
  { value: "", label: "All States" },
  { value: "unclaimed", label: "Unclaimed" },
  { value: "pending_claim", label: "Pending Claim" },
  { value: "claimed", label: "Claimed" },
  { value: "premium", label: "Premium" },
] as const;

const TIER_OPTIONS = [
  { value: "", label: "All Tiers" },
  { value: "tier1", label: "Tier 1" },
  { value: "tier2", label: "Tier 2" },
  { value: "tier3", label: "Tier 3" },
] as const;

const STATE_COLORS: Record<string, string> = {
  unclaimed: "text-n-slate bg-n-surface",
  pending_claim: "text-n-warning bg-n-warning/10",
  claimed: "text-n-success bg-n-success/10",
  premium: "text-[#9146ff] bg-[#9146ff]/10",
};

const TIER_COLORS: Record<string, string> = {
  tier1: "text-n-warning bg-n-warning/10",
  tier2: "text-n-navy bg-n-navy/10",
  tier3: "text-n-slate bg-n-surface",
};

// ─── Bulk Import Modal ───

function BulkImportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus(open, onClose);
  const [inputError, setInputError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [results, setResults] = useState<
    { slug: string; status: string; reason?: string }[] | null
  >(null);

  const utils = trpc.useUtils();
  const bulkImport = trpc.admin.bulkImport.useMutation({
    onSuccess: (data) => {
      setResults(data.results);
      void utils.admin.getCreatorList.invalidate();
    },
  });

  const handleSubmit = () => {
    setInputError(null);
    try {
      const creators = JSON.parse(jsonInput);
      if (!Array.isArray(creators)) {
        setInputError("Enter a JSON array of creators.");
        return;
      }
      bulkImport.mutate({ creators });
    } catch {
      setInputError(
        "The JSON could not be read. Check the format and try again.",
      );
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-import-title"
        tabIndex={-1}
        className="mx-4 max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-n-line bg-white p-6"
      >
        <h2 id="bulk-import-title" className="text-2xl font-bold text-n-ink">
          Bulk import
        </h2>
        <p className="mt-1 text-xs text-n-slate">
          Paste a JSON array of creators. Each entry needs: displayName, slug,
          primaryPlatform, platformUsername, platformUserId.
        </p>

        <label htmlFor="bulk-import-json" className="sr-only">
          Creator JSON array
        </label>
        <textarea
          id="bulk-import-json"
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          rows={8}
          className="mt-3 w-full rounded-lg border border-n-line bg-n-surface p-3 font-mono text-xs text-n-ink outline-none focus:border-n-control"
          placeholder={`[
  {
    "displayName": "Example",
    "slug": "example",
    "primaryPlatform": "twitch",
    "platformUsername": "example",
    "platformUserId": "12345"
  }
]`}
        />

        {inputError && (
          <p role="alert" className="mt-3 text-sm text-n-error">
            {inputError}
          </p>
        )}
        {bulkImport.error && (
          <p role="alert" className="mt-2 text-sm text-n-error">
            {bulkImport.error.message}
          </p>
        )}

        {results && (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-n-line bg-n-surface p-3">
            <p className="mb-2 text-xs font-medium text-n-ink">Results:</p>
            {results.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-0.5 text-xs"
              >
                <span className="text-n-ink">{r.slug}</span>
                <span
                  className={
                    r.status === "created" ? "text-n-success" : "text-n-slate"
                  }
                >
                  {r.status}
                  {r.reason ? ` — ${r.reason}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setResults(null);
              setJsonInput("");
              onClose();
            }}
          >
            Close
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={bulkImport.isPending || !jsonInput.trim()}
          >
            {bulkImport.isPending ? "Importing..." : "Import"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───

export function CreatorManagement() {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const limit = 20;

  const utils = trpc.useUtils();

  const { data, isLoading, isError, refetch } =
    trpc.admin.getCreatorList.useQuery({
      search: search || undefined,
      state:
        (stateFilter as
          | "unclaimed"
          | "pending_claim"
          | "claimed"
          | "premium") || undefined,
      tier: (tierFilter as "tier1" | "tier2" | "tier3") || undefined,
      page,
      limit,
    });

  const updateTier = trpc.admin.updateSnapshotTier.useMutation({
    onSuccess: async () => {
      await utils.admin.getCreatorList.invalidate();
    },
  });

  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const triggerSnapshot = trpc.snapshot.triggerManualSnapshot.useMutation({
    onSettled: () => {
      setRefreshingId(null);
    },
    onSuccess: async () => {
      await utils.admin.getCreatorList.invalidate();
    },
    onError: (err) => {
      setRefreshError(err.message);
      setTimeout(() => setRefreshError(null), 5000);
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      {updateTier.error && (
        <p role="alert" className="text-sm text-n-error">
          {updateTier.error.message}
        </p>
      )}
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          aria-label="Search creators"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name or slug..."
          className="min-w-0 basis-full sm:basis-auto flex-1 rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink outline-none focus:border-n-control"
        />
        <select
          aria-label="Filter by state"
          value={stateFilter}
          onChange={(e) => {
            setStateFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink outline-none"
        >
          {STATE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by tier"
          value={tierFilter}
          onChange={(e) => {
            setTierFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink outline-none"
        >
          {TIER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => setImportOpen(true)}>
          Bulk Import
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            if (items.length === 0) return;
            const headers = [
              "displayName",
              "slug",
              "state",
              "tier",
              "platform",
              "totalFollowers",
              "lastSnapshot",
            ];
            const rows = items.map((c) => [
              c.displayName,
              c.slug,
              c.state,
              c.snapshotTier,
              c.primaryPlatform,
              String(c.totalFollowers ?? 0),
              c.lastSnapshotAt ? new Date(c.lastSnapshotAt).toISOString() : "",
            ]);
            const csv = [headers, ...rows]
              .map((r) => r.map((v) => `"${v}"`).join(","))
              .join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "creators.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-n-slate">
          {total} creator{total !== 1 ? "s" : ""} found
        </div>
        {refreshError && (
          <div className="text-xs text-n-error">{refreshError}</div>
        )}
      </div>

      {/* Table */}
      {isError ? (
        <QueryError label="creators" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="text-sm text-n-slate">
            No creators match your filters.
          </p>
        </Card>
      ) : (
        <div
          role="region"
          aria-label="Creators table"
          tabIndex={0}
          className="overflow-x-auto border-y border-n-line"
        >
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Creators</caption>
            <thead className="border-b border-n-line bg-n-surface">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Creator
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  State
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Tier
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Followers
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Last Snapshot
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-n-line bg-white">
              {items.map((creator) => {
                const avatarSrc = getSafeImageSrc(creator.avatarUrl);
                const config = creator.primaryPlatform
                  ? PLATFORM_CONFIG[creator.primaryPlatform]
                  : null;

                return (
                  <tr key={creator.id} className="hover:bg-n-surface/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {avatarSrc ? (
                          <Image
                            src={avatarSrc}
                            alt={creator.displayName}
                            width={32}
                            height={32}
                            className="rounded-full"
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-n-surface text-xs font-bold text-n-ink">
                            {creator.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-n-ink">
                            {creator.displayName}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-n-slate">
                            <span>/{creator.slug}</span>
                            {config && (
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: config.color }}
                                title={config.name}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATE_COLORS[creator.state] ?? STATE_COLORS.unclaimed}`}
                      >
                        {creator.state}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={creator.snapshotTier}
                        onChange={(e) => {
                          updateTier.mutate({
                            creatorProfileId: creator.id,
                            tier: e.target.value as "tier1" | "tier2" | "tier3",
                          });
                        }}
                        className={`rounded-full border-0 px-2 py-0.5 text-[10px] font-medium outline-none ${TIER_COLORS[creator.snapshotTier] ?? TIER_COLORS.tier3}`}
                      >
                        <option value="tier1">Tier 1</option>
                        <option value="tier2">Tier 2</option>
                        <option value="tier3">Tier 3</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-n-ink">
                      {formatNumber(Number(creator.totalFollowers ?? 0))}
                    </td>
                    <td className="px-4 py-3 text-xs text-n-slate">
                      {creator.lastSnapshotAt
                        ? formatRelativeTime(creator.lastSnapshotAt)
                        : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/creator/${creator.slug}`}>
                          <Button variant="secondary" size="sm">
                            View
                          </Button>
                        </Link>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={refreshingId === creator.id}
                          onClick={() => {
                            if (!creator.primaryPlatform) return;
                            setRefreshingId(creator.id);
                            triggerSnapshot.mutate({
                              creatorProfileId: creator.id,
                              platform: creator.primaryPlatform,
                            });
                          }}
                        >
                          {refreshingId === creator.id
                            ? "Refreshing..."
                            : "Refresh"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
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

      {/* Bulk Import Modal */}
      <BulkImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
