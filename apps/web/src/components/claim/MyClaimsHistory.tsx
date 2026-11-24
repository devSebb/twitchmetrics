"use client";

import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { getSafeImageSrc } from "@/lib/safeImage";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  approved: {
    label: "Approved",
    className: "bg-n-success/20 text-n-success",
  },
  pending: {
    label: "Pending",
    className: "bg-n-warning/20 text-n-warning",
  },
  rejected: {
    label: "Rejected",
    className: "bg-n-error/20 text-n-error",
  },
  expired: {
    label: "Expired",
    className: "bg-n-slate/20 text-n-slate",
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
    return <div className="text-sm text-n-slate">Loading your claims...</div>;
  }

  if (!claims || claims.length === 0) {
    return (
      <div className="rounded-lg border border-n-line bg-white px-6 py-8 text-center">
        <p className="text-sm text-n-slate">No claims yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-n-slate uppercase">
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
              className="flex items-center gap-3 rounded-lg border border-n-line bg-white p-3"
            >
              <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-n-surface">
                {avatarSrc ? (
                  <Image
                    src={avatarSrc}
                    alt={claim.creatorProfile.displayName}
                    fill
                    className="object-cover"
                    sizes="32px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white bg-n-navy">
                    {claim.creatorProfile.displayName.charAt(0)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-n-ink">
                  {claim.creatorProfile.displayName}
                </div>
                <div className="flex items-center gap-2 text-xs text-n-slate">
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
                    className="text-xs font-medium text-n-red hover:underline"
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
