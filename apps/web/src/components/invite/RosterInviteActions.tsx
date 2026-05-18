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
      <div className="rounded-xl border border-[#22c55e]/40 bg-[#22c55e]/10 p-4 text-center">
        <p className="text-sm font-semibold text-[#86efac]">
          Invitation accepted
        </p>
        <p className="mt-1 text-xs text-[#DBDEE1]">
          Redirecting to your dashboard…
        </p>
      </div>
    );
  }

  if (done === "declined") {
    return (
      <div className="rounded-xl border border-[#3F4147] bg-[#1E1F22] p-4 text-center">
        <p className="text-sm font-semibold text-[#DBDEE1]">
          Invitation declined
        </p>
        <p className="mt-1 text-xs text-[#949BA4]">
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
          className="flex-1 rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615] disabled:opacity-50"
        >
          {accept.isPending ? "Accepting…" : "Accept invitation"}
        </button>
        <button
          type="button"
          onClick={() => decline.mutate({ accessId })}
          disabled={isPending}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-4 py-2.5 text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#4E5058] disabled:opacity-50"
        >
          {decline.isPending ? "Declining…" : "Decline"}
        </button>
      </div>
      {error && <p className="text-xs text-[#f87171]">{error}</p>}
    </div>
  );
}
