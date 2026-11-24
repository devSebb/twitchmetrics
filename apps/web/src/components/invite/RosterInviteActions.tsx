"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

type RosterInviteActionsProps = {
  accessId: string;
};

export function RosterInviteActions({ accessId }: RosterInviteActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

  const accept = trpc.rosterInvite.accept.useMutation({
    onSuccess: () => {
      setDone("accepted");
      setError(null);
      // Brief pause so the user sees the success state, then route to dashboard.
      setTimeout(() => router.push("/dashboard/home"), 1200);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const decline = trpc.rosterInvite.decline.useMutation({
    onSuccess: () => {
      setDone("declined");
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const isPending = accept.isPending || decline.isPending;

  if (done === "accepted") {
    return (
      <div className="rounded-xl border border-n-success/40 bg-n-success/10 p-4 text-center">
        <p className="text-sm font-semibold text-n-success">
          Invitation accepted
        </p>
        <p className="mt-1 text-xs text-n-ink">
          Redirecting to your dashboard…
        </p>
      </div>
    );
  }

  if (done === "declined") {
    return (
      <div className="rounded-xl border border-n-line bg-white p-4 text-center">
        <p className="text-sm font-semibold text-n-ink">Invitation declined</p>
        <p className="mt-1 text-xs text-n-slate">
          The manager has been notified.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => accept.mutate({ accessId })}
          disabled={isPending}
          className="flex-1 rounded-lg bg-n-red px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-n-red-hover disabled:opacity-50"
        >
          {accept.isPending ? "Accepting…" : "Accept invitation"}
        </button>
        <button
          type="button"
          onClick={() => decline.mutate({ accessId })}
          disabled={isPending}
          className="rounded-lg border border-n-line bg-n-surface px-4 py-2.5 text-sm font-semibold text-n-ink transition-colors hover:bg-n-surface disabled:opacity-50"
        >
          {decline.isPending ? "Declining…" : "Decline"}
        </button>
      </div>
      {error && <p className="text-xs text-n-error">{error}</p>}
    </div>
  );
}
