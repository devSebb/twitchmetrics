"use client";

import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { trpc } from "@/lib/trpc";

export function ClaimCTA() {
  const { data: claims } = trpc.claim.myClaims.useQuery(undefined, {
    staleTime: 30_000,
  });

  const pendingClaim = claims?.find((c) => c.status === "pending");

  return (
    <Card className="space-y-3">
      <h2 className="text-xl font-semibold text-[#F2F3F5]">
        Claim your creator profile
      </h2>
      <p className="text-sm text-[#949BA4]">
        Search for your profile, verify ownership, and unlock private analytics,
        demographics, subscriber metrics, and media kit tools.
      </p>

      {pendingClaim && (
        <div className="flex items-center gap-2 rounded-lg bg-[#f59e0b]/10 px-3 py-2">
          <svg
            className="h-4 w-4 flex-shrink-0 text-[#f59e0b]"
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
          <span className="text-sm text-[#fcd34d]">
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

      <Link href="/claim">
        <Button>Start claim flow</Button>
      </Link>
    </Card>
  );
}
