"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import { trpc } from "@/lib/trpc";

export function ClaimCTA() {
  const { data: claims } = trpc.claim.myClaims.useQuery(undefined, {
    staleTime: 30_000,
  });

  const pendingClaim = claims?.find((c) => c.status === "pending");

  return (
    <Card className="space-y-3">
      <h2 className="text-xl font-semibold text-n-ink">
        Claim your creator profile
      </h2>
      <p className="text-sm text-n-slate">
        Search for your profile, verify ownership, and unlock private analytics,
        demographics, subscriber metrics, and media kit tools.
      </p>

      {pendingClaim && (
        <div className="flex items-center gap-2 rounded-lg bg-n-warning/10 px-3 py-2">
          <svg
            className="h-4 w-4 flex-shrink-0 text-n-warning"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm text-n-warning">
            You have a pending claim for{" "}
            <Link
              href={`/claim?profile=${pendingClaim.creatorProfile.id}`}
              className="font-medium underline hover:no-underline"
            >
              {pendingClaim.creatorProfile.displayName}
            </Link>
          </span>
        </div>
      )}

      <Link href="/claim" className="n-button n-button-primary">
        Start claim flow
      </Link>
    </Card>
  );
}
