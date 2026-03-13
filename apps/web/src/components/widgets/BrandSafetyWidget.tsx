"use client";

import { trpc } from "@/lib/trpc";
import { EmptyState } from "./EmptyState";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

type Props = {
  profile: SerializedProfile;
  isClaimed: boolean;
};

function getRatingColor(rating: string): string {
  switch (rating) {
    case "safe":
      return "#22c55e";
    case "moderate":
      return "#f59e0b";
    case "review":
      return "#ef4444";
    default:
      return "#949BA4";
  }
}

function getRatingLabel(rating: string): string {
  switch (rating) {
    case "safe":
      return "Safe";
    case "moderate":
      return "Moderate";
    case "review":
      return "Review";
    default:
      return "Unknown";
  }
}

export function BrandSafetyWidget({ profile, isClaimed }: Props) {
  const { data, isLoading } = trpc.snapshot.getLatestMetrics.useQuery({
    creatorProfileId: profile.id,
  });

  if (isLoading) {
    return (
      <div className="flex h-48 animate-pulse items-center justify-center rounded-lg bg-[#383A40]">
        <span className="text-sm text-[#949BA4]">Loading...</span>
      </div>
    );
  }

  const ext = data?.snapshot?.extendedMetrics as Record<string, unknown> | null;
  const rating =
    ext && typeof ext.brand_safety_rating === "string"
      ? ext.brand_safety_rating
      : null;
  const tags =
    ext && Array.isArray(ext.brand_safety_tags)
      ? (ext.brand_safety_tags as string[])
      : null;

  if (!tags && !rating) {
    return (
      <EmptyState
        variant="no_data"
        title="Not Rated"
        message="Brand safety rating not yet available."
        compact
      />
    );
  }

  const color = rating ? getRatingColor(rating) : "#949BA4";

  return (
    <div className="space-y-3">
      {/* Rating badge */}
      {rating && (
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase text-white"
          style={{ backgroundColor: color }}
        >
          {getRatingLabel(rating)}
        </span>
      )}

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-[#383A40] px-2.5 py-1 text-xs text-[#DBDEE1]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
