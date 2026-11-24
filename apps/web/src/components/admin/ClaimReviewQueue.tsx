"use client";

import { useState } from "react";
import { QueryError } from "@/components/ui/QueryError";
import { useDialogFocus } from "@/hooks/useDialogFocus";
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
  pending: "text-n-warning bg-n-warning/10",
  approved: "text-n-success bg-n-success/10",
  rejected: "text-n-error bg-n-error/10",
  expired: "text-n-slate bg-n-surface",
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
  busy,
  error,
}: {
  claim: ClaimItem;
  onClose: () => void;
  onApprove: (id: string, notes?: string) => void;
  onReject: (id: string, notes: string) => void;
  busy: boolean;
  error: string | undefined;
}) {
  const dialogRef = useDialogFocus(true, onClose);
  const [notes, setNotes] = useState(claim.reviewNotes ?? "");
  const isPending = claim.status === "pending";

  return (
    <div
      className="fixed inset-0 z-[90] flex justify-end bg-black/60"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-details-title"
        tabIndex={-1}
        className="h-full w-full max-w-lg overflow-y-auto bg-n-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-n-line bg-n-surface px-6 py-4">
          <h2
            id="claim-details-title"
            className="text-lg font-semibold text-n-ink"
          >
            Claim Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close claim details"
            className="text-n-slate hover:text-n-ink"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-6">
          {error && (
            <p role="alert" className="text-sm text-n-error">
              {error}
            </p>
          )}
          <div>
            <p className="text-xs uppercase text-n-slate">Creator</p>
            <p className="mt-1 font-semibold text-n-ink">
              {claim.creatorProfile.displayName}
            </p>
            <p className="text-xs text-n-slate">/{claim.creatorProfile.slug}</p>
          </div>

          <div>
            <p className="text-xs uppercase text-n-slate">Claimed by</p>
            <p className="mt-1 text-sm text-n-ink">
              {claim.user.name ?? "Unknown"}
            </p>
            <p className="text-xs text-n-slate">
              {claim.user.email ?? "no-email"}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase text-n-slate">Method</p>
            <p className="mt-1 text-sm text-n-ink">{claim.method}</p>
          </div>

          <div>
            <p className="text-xs uppercase text-n-slate">Status</p>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[claim.status]}`}
            >
              {claim.status}
            </span>
          </div>

          <div>
            <p className="text-xs uppercase text-n-slate">Submitted</p>
            <p className="mt-1 text-xs text-n-slate">
              {new Date(claim.createdAt).toLocaleString()}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase text-n-slate">Evidence</p>
            <div className="mt-1 space-y-1">
              {claim.evidenceUrls.length > 0 ? (
                claim.evidenceUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-n-navy hover:underline"
                  >
                    {url}
                  </a>
                ))
              ) : (
                <p className="text-sm text-n-slate">None</p>
              )}
            </div>
          </div>

          {isPending && (
            <div className="space-y-2 border-t border-n-line pt-4">
              <textarea
                aria-label="Review notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-24 w-full rounded-lg border border-n-line bg-n-surface p-2 text-sm text-n-ink outline-none"
                placeholder="Review notes..."
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => onApprove(claim.id, notes || undefined)}
                  className="bg-[#16a34a] hover:bg-[#15803d]"
                >
                  Approve
                </Button>
                <button
                  type="button"
                  disabled={busy || !notes.trim()}
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

  const { data, isLoading, isError, refetch } =
    trpc.admin.getClaimQueue.useQuery({
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
    try {
      for (const id of bulkSelected)
        await approveMutation.mutateAsync({ claimRequestId: id });
    } catch {
      /* The mutation error is displayed in the queue. */
    }
  };

  return (
    <div className="space-y-4">
      {(approveMutation.error || rejectMutation.error) && (
        <p role="alert" className="text-sm text-n-error">
          {approveMutation.error?.message ?? rejectMutation.error?.message}
        </p>
      )}
      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-n-line bg-white p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={status === tab.value}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
              setBulkSelected(new Set());
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              status === tab.value
                ? "bg-n-red text-white"
                : "text-n-slate hover:text-n-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {status === "pending" && bulkSelected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-n-line bg-n-surface px-4 py-2">
          <span className="text-sm text-n-ink">
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
            className="text-xs text-n-slate hover:text-n-ink"
          >
            Clear
          </button>
        </div>
      )}

      <div className="text-xs text-n-slate">
        {total} claim{total !== 1 ? "s" : ""}
      </div>

      {isError ? (
        <QueryError label="claims" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="text-sm text-n-slate">No {status} claims.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((claim) => (
            <div
              key={claim.id}
              className="rounded-xl border border-n-line bg-white p-4 hover:border-n-control"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  {status === "pending" && (
                    <input
                      type="checkbox"
                      aria-label={`Select claim for ${claim.creatorProfile.displayName}`}
                      checked={bulkSelected.has(claim.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleBulk(claim.id)}
                      className="h-4 w-4 rounded"
                    />
                  )}
                  <div>
                    <button
                      type="button"
                      onClick={() => setSelectedClaim(claim)}
                      className="text-left text-sm font-semibold text-n-ink underline underline-offset-4"
                    >
                      {claim.creatorProfile.displayName}
                    </button>
                    <p className="text-xs text-n-slate">
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
                  <span className="text-xs text-n-slate">
                    {new Date(claim.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
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

      {selectedClaim && (
        <ClaimDetailPanel
          key={selectedClaim.id}
          claim={selectedClaim}
          busy={approveMutation.isPending || rejectMutation.isPending}
          error={
            approveMutation.error?.message ?? rejectMutation.error?.message
          }
          onClose={() => setSelectedClaim(null)}
          onApprove={(id, notes) => {
            approveMutation.mutate({
              claimRequestId: id,
              reviewNotes: notes,
            });
          }}
          onReject={(id, notes) => {
            rejectMutation.mutate({
              claimRequestId: id,
              reviewNotes: notes,
            });
          }}
        />
      )}
    </div>
  );
}
