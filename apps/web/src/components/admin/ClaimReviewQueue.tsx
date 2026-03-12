"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function ClaimReviewQueue() {
  const [page, setPage] = useState(1);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const utils = trpc.useUtils();

  const pendingQuery = trpc.claim.listPending.useQuery({
    page,
    limit: 20,
  });
  const approveMutation = trpc.claim.approve.useMutation({
    onSuccess: async () => {
      await utils.claim.listPending.invalidate();
    },
  });
  const rejectMutation = trpc.claim.reject.useMutation({
    onSuccess: async () => {
      await utils.claim.listPending.invalidate();
    },
  });

  const data = pendingQuery.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-4">
        <h2 className="text-lg font-semibold text-[#F2F3F5]">
          Pending Manual Claims
        </h2>
        <p className="mt-1 text-sm text-[#949BA4]">
          Review claim evidence and approve or reject submissions.
        </p>
      </div>

      <div className="space-y-3">
        {items.map((claim) => (
          <div
            key={claim.id}
            className="rounded-xl border border-[#3F4147] bg-[#313338] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#F2F3F5]">
                  {claim.creatorProfile.displayName}
                </p>
                <p className="text-xs text-[#949BA4]">
                  Claimed by {claim.user.name ?? "Unknown"} (
                  {claim.user.email ?? "no-email"})
                </p>
              </div>
              <p className="text-xs text-[#949BA4]">
                {new Date(claim.createdAt).toLocaleString()}
              </p>
            </div>

            <div className="mt-3">
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
                  <p className="text-sm text-[#949BA4]">
                    No evidence URLs provided.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <textarea
                value={reviewNotes[claim.id] ?? ""}
                onChange={(event) => {
                  setReviewNotes((prev) => ({
                    ...prev,
                    [claim.id]: event.target.value,
                  }));
                }}
                className="h-20 w-full rounded-lg border border-[#3F4147] bg-[#383A40] p-2 text-sm text-[#F2F3F5] outline-none"
                placeholder="Review notes..."
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void approveMutation.mutateAsync({
                      claimRequestId: claim.id,
                      reviewNotes: reviewNotes[claim.id] || undefined,
                    });
                  }}
                  className="rounded-lg bg-[#16a34a] px-3 py-2 text-sm font-semibold text-white"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const notes = reviewNotes[claim.id]?.trim();
                    if (!notes) return;
                    void rejectMutation.mutateAsync({
                      claimRequestId: claim.id,
                      reviewNotes: notes,
                    });
                  }}
                  className="rounded-lg bg-[#dc2626] px-3 py-2 text-sm font-semibold text-white"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-4 text-sm text-[#949BA4]">
            No pending manual claims.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((value) => Math.max(1, value - 1))}
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
          onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          disabled={page >= pageCount}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
