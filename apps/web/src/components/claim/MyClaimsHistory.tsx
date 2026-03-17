"use client";

import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { getSafeImageSrc } from "@/lib/safeImage";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  approved: {
    label: "Approved",
    className: "bg-[#22c55e]/20 text-[#86efac]",
  },
  pending: {
    label: "Pending",
    className: "bg-[#f59e0b]/20 text-[#fcd34d]",
  },
  rejected: {
    label: "Rejected",
    className: "bg-[#ef4444]/20 text-[#fca5a5]",
  },
  expired: {
    label: "Expired",
    className: "bg-[#6b7280]/20 text-[#9ca3af]",
  },
};

const METHOD_LABEL: Record<string, string> = {
  oauth: "OAuth",
  bio_challenge: "Bio",
  manual_review: "Manual",
  cross_platform: "Cross-Platform",
  post_challenge: "Post",
};

export function MyClaimsHistory() {
  const { data: claims, isLoading } = trpc.claim.myClaims.useQuery();

  if (isLoading) {
    return <div className="text-sm text-[#949BA4]">Loading your claims...</div>;
  }

  if (!claims || claims.length === 0) {
    return (
      <div className="rounded-lg border border-[#3F4147] bg-[#313338] px-6 py-8 text-center">
        <p className="text-sm text-[#949BA4]">No claims yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-[#949BA4] uppercase">
        Your Claims
      </h3>
      <div className="grid gap-2">
        {claims.map((claim) => {
          const badge = STATUS_BADGE[claim.status] ?? STATUS_BADGE.pending!;
          const methodLabel = METHOD_LABEL[claim.method] ?? claim.method;
          const avatarSrc = getSafeImageSrc(claim.creatorProfile.avatarUrl);
          const isPending = claim.status === "pending";

          return (
            <div
              key={claim.id}
              className="flex items-center gap-3 rounded-lg border border-[#3F4147] bg-[#313338] p-3"
            >
              <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-[#383A40]">
                {avatarSrc ? (
                  <Image
                    src={avatarSrc}
                    alt={claim.creatorProfile.displayName}
                    fill
                    className="object-cover"
                    sizes="32px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white bg-[#9146ff]">
                    {claim.creatorProfile.displayName.charAt(0)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[#DBDEE1]">
                  {claim.creatorProfile.displayName}
                </div>
                <div className="flex items-center gap-2 text-xs text-[#949BA4]">
                  <span>{methodLabel}</span>
                  <span>·</span>
                  <span>{new Date(claim.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                >
                  {badge.label}
                </span>
                {isPending && (
                  <Link
                    href={`/claim?profile=${claim.creatorProfile.id}`}
                    className="text-xs font-medium text-[#E32C19] hover:underline"
                  >
                    Resume
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
