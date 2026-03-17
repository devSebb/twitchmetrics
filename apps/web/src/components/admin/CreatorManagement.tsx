"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Badge, Button, Card, Skeleton } from "@/components/ui";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { formatNumber, formatRelativeTime } from "@/lib/utils/format";
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
  unclaimed: "text-[#949BA4] bg-[#383A40]",
  pending_claim: "text-[#f59e0b] bg-[#f59e0b]/10",
  claimed: "text-[#22c55e] bg-[#22c55e]/10",
  premium: "text-[#9146ff] bg-[#9146ff]/10",
};

const TIER_COLORS: Record<string, string> = {
  tier1: "text-[#f59e0b] bg-[#f59e0b]/10",
  tier2: "text-[#3b82f6] bg-[#3b82f6]/10",
  tier3: "text-[#949BA4] bg-[#383A40]",
};

// ─── Bulk Import Modal ───

function BulkImportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
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
    try {
      const creators = JSON.parse(jsonInput);
      if (!Array.isArray(creators)) return;
      bulkImport.mutate({ creators });
    } catch {
      // invalid JSON
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-[#3F4147] bg-[#313338] p-6">
        <h2 className="text-lg font-semibold text-[#F2F3F5]">Bulk Import</h2>
        <p className="mt-1 text-xs text-[#949BA4]">
          Paste a JSON array of creators. Each entry needs: displayName, slug,
          primaryPlatform, platformUsername, platformUserId.
        </p>

        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          rows={8}
          className="mt-3 w-full rounded-lg border border-[#3F4147] bg-[#383A40] p-3 font-mono text-xs text-[#DBDEE1] outline-none focus:border-[#4E5058]"
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

        {bulkImport.error && (
          <p className="mt-2 text-xs text-[#ef4444]">
            {bulkImport.error.message}
          </p>
        )}

        {results && (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-[#3F4147] bg-[#2B2D31] p-3">
            <p className="mb-2 text-xs font-medium text-[#F2F3F5]">Results:</p>
            {results.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-0.5 text-xs"
              >
                <span className="text-[#DBDEE1]">{r.slug}</span>
                <span
                  className={
                    r.status === "created" ? "text-[#22c55e]" : "text-[#949BA4]"
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

  const { data, isLoading } = trpc.admin.getCreatorList.useQuery({
    search: search || undefined,
    state:
      (stateFilter as "unclaimed" | "pending_claim" | "claimed" | "premium") ||
      undefined,
    tier: (tierFilter as "tier1" | "tier2" | "tier3") || undefined,
    page,
    limit,
  });

  const updateTier = trpc.admin.updateSnapshotTier.useMutation({
    onSuccess: async () => {
      await utils.admin.getCreatorList.invalidate();
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name or slug..."
          className="flex-1 rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] outline-none focus:border-[#4E5058]"
        />
        <select
          value={stateFilter}
          onChange={(e) => {
            setStateFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] outline-none"
        >
          {STATE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={tierFilter}
          onChange={(e) => {
            setTierFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] outline-none"
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
      </div>

      {/* Stats */}
      <div className="text-xs text-[#949BA4]">
        {total} creator{total !== 1 ? "s" : ""} found
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="text-sm text-[#949BA4]">
            No creators match your filters.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#3F4147]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#3F4147] bg-[#2B2D31]">
              <tr>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Creator
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  State
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Tier
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Followers
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Last Snapshot
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3F4147] bg-[#313338]">
              {items.map((creator) => {
                const avatarSrc = getSafeImageSrc(creator.avatarUrl);
                const config = creator.primaryPlatform
                  ? PLATFORM_CONFIG[creator.primaryPlatform]
                  : null;

                return (
                  <tr key={creator.id} className="hover:bg-[#383A40]/50">
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
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#383A40] text-xs font-bold text-[#F2F3F5]">
                            {creator.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#F2F3F5]">
                            {creator.displayName}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-[#949BA4]">
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
                    <td className="px-4 py-3 text-[#F2F3F5]">
                      {formatNumber(Number(creator.totalFollowers ?? 0))}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#949BA4]">
                      {creator.lastSnapshotAt
                        ? formatRelativeTime(creator.lastSnapshotAt)
                        : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/creator/${creator.slug}`}>
                        <Button variant="secondary" size="sm">
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
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

      {/* Bulk Import Modal */}
      <BulkImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
