"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button, Card, Skeleton } from "@/components/ui";

type ClaimStatus = "pending" | "approved" | "rejected" | "expired";

const STATUS_TABS: { value: ClaimStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

const STATUS_COLORS: Record<ClaimStatus, string> = {
  pending: "text-[#f59e0b] bg-[#f59e0b]/10",
  approved: "text-[#22c55e] bg-[#22c55e]/10",
  rejected: "text-[#ef4444] bg-[#ef4444]/10",
  expired: "text-[#949BA4] bg-[#383A40]",
};

type ClaimItem = {
  id: string;
  createdAt: Date;
  status: ClaimStatus;
  method: string;
  evidenceUrls: string[];
  reviewNotes: string | null;
  creatorProfile: {
    id: string;
    displayName: string;
    slug: string;
    avatarUrl: string | null;
    totalFollowers: bigint;
    primaryPlatform: string;
  };
  user: {
    id: string;
    email: string | null;
    name: string | null;
  };
};

function ClaimDetailPanel({
  claim,
  onClose,
  onApprove,
  onReject,
}: {
  claim: ClaimItem;
  onClose: () => void;
  onApprove: (id: string, notes?: string) => void;
  onReject: (id: string, notes: string) => void;
}) {
  const [notes, setNotes] = useState(claim.reviewNotes ?? "");
  const isPending = claim.status === "pending";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-[#2B2D31] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[#3F4147] bg-[#2B2D31] px-6 py-4">
          <h2 className="text-lg font-semibold text-[#F2F3F5]">
            Claim Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#949BA4] hover:text-[#DBDEE1]"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <p className="text-xs uppercase text-[#949BA4]">Creator</p>
            <p className="mt-1 font-semibold text-[#F2F3F5]">
              {claim.creatorProfile.displayName}
            </p>
            <p className="text-xs text-[#949BA4]">
              /{claim.creatorProfile.slug}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase text-[#949BA4]">Claimed by</p>
            <p className="mt-1 text-sm text-[#DBDEE1]">
              {claim.user.name ?? "Unknown"}
            </p>
            <p className="text-xs text-[#949BA4]">
              {claim.user.email ?? "no-email"}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase text-[#949BA4]">Method</p>
            <p className="mt-1 text-sm text-[#DBDEE1]">{claim.method}</p>
          </div>

          <div>
            <p className="text-xs uppercase text-[#949BA4]">Status</p>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[claim.status]}`}
            >
              {claim.status}
            </span>
          </div>

          <div>
            <p className="text-xs uppercase text-[#949BA4]">Submitted</p>
            <p className="mt-1 text-xs text-[#949BA4]">
              {new Date(claim.createdAt).toLocaleString()}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase text-[#949BA4]">Evidence</p>
            <div className="mt-1 space-y-1">
              {claim.evidenceUrls.length > 0 ? (
                claim.evidenceUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-[#93c5fd] hover:underline"
                  >
                    {url}
                  </a>
                ))
              ) : (
                <p className="text-sm text-[#949BA4]">None</p>
              )}
            </div>
          </div>

          {isPending && (
            <div className="space-y-2 border-t border-[#3F4147] pt-4">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-24 w-full rounded-lg border border-[#3F4147] bg-[#383A40] p-2 text-sm text-[#F2F3F5] outline-none"
                placeholder="Review notes..."
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => onApprove(claim.id, notes || undefined)}
                  className="bg-[#16a34a] hover:bg-[#15803d]"
                >
                  Approve
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    if (!notes.trim()) return;
                    onReject(claim.id, notes);
                  }}
                  className="rounded-lg bg-[#dc2626] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#b91c1c]"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ClaimReviewQueue() {
  const [status, setStatus] = useState<ClaimStatus>("pending");
  const [page, setPage] = useState(1);
  const [selectedClaim, setSelectedClaim] = useState<ClaimItem | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.getClaimQueue.useQuery({
    status,
    page,
    limit: 20,
  });

  const approveMutation = trpc.claim.approve.useMutation({
    onSuccess: async () => {
      await utils.admin.getClaimQueue.invalidate();
      setSelectedClaim(null);
      setBulkSelected(new Set());
    },
  });
  const rejectMutation = trpc.claim.reject.useMutation({
    onSuccess: async () => {
      await utils.admin.getClaimQueue.invalidate();
      setSelectedClaim(null);
      setBulkSelected(new Set());
    },
  });

  const items = (data?.items ?? []) as ClaimItem[];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  const toggleBulk = (id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkApprove = async () => {
    for (const id of bulkSelected) {
      await approveMutation.mutateAsync({ claimRequestId: id });
    }
  };

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex gap-1 rounded-xl border border-[#3F4147] bg-[#313338] p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
              setBulkSelected(new Set());
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              status === tab.value
                ? "bg-[#E32C19] text-white"
                : "text-[#949BA4] hover:text-[#DBDEE1]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {status === "pending" && bulkSelected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-[#3F4147] bg-[#383A40] px-4 py-2">
          <span className="text-sm text-[#DBDEE1]">
            {bulkSelected.size} selected
          </span>
          <Button
            size="sm"
            onClick={() => {
              void bulkApprove();
            }}
            disabled={approveMutation.isPending}
          >
            Approve All Selected
          </Button>
          <button
            type="button"
            onClick={() => setBulkSelected(new Set())}
            className="text-xs text-[#949BA4] hover:text-[#DBDEE1]"
          >
            Clear
          </button>
        </div>
      )}

      <div className="text-xs text-[#949BA4]">
        {total} claim{total !== 1 ? "s" : ""}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="text-sm text-[#949BA4]">No {status} claims.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((claim) => (
            <div
              key={claim.id}
              className="rounded-xl border border-[#3F4147] bg-[#313338] p-4 cursor-pointer hover:border-[#4E5058]"
              onClick={() => setSelectedClaim(claim)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  {status === "pending" && (
                    <input
                      type="checkbox"
                      checked={bulkSelected.has(claim.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleBulk(claim.id)}
                      className="h-4 w-4 rounded"
                    />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-[#F2F3F5]">
                      {claim.creatorProfile.displayName}
                    </p>
                    <p className="text-xs text-[#949BA4]">
                      by {claim.user.name ?? "Unknown"} · {claim.method}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[claim.status]}`}
                  >
                    {claim.status}
                  </span>
                  <span className="text-xs text-[#949BA4]">
                    {new Date(claim.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
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

      {selectedClaim && (
        <ClaimDetailPanel
          claim={selectedClaim}
          onClose={() => setSelectedClaim(null)}
          onApprove={(id, notes) => {
            void approveMutation.mutateAsync({
              claimRequestId: id,
              reviewNotes: notes,
            });
          }}
          onReject={(id, notes) => {
            void rejectMutation.mutateAsync({
              claimRequestId: id,
              reviewNotes: notes,
            });
          }}
        />
      )}
    </div>
  );
}
