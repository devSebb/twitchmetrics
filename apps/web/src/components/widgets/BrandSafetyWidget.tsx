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
      return "#167044";
    case "moderate":
      return "#895C0A";
    case "review":
      return "#B4232B";
    default:
      return "#4A505B";
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
      <div className="flex h-48 animate-pulse items-center justify-center rounded-lg bg-n-surface">
        <span className="text-sm text-n-slate">Loading...</span>
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

  const color = rating ? getRatingColor(rating) : "#4A505B";

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
              className="rounded-md bg-n-surface px-2.5 py-1 text-xs text-n-ink"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
