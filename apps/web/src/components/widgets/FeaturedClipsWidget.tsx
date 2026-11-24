"use client";
import { WidgetQueryError } from "./WidgetQueryError";

import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { formatNumber, formatRelativeTime } from "@/lib/utils/format";
import { EmptyWidgetSentinel } from "@/components/dashboard/WidgetCard";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

type Props = {
  profile: SerializedProfile;
};

export function FeaturedClipsWidget({ profile }: Props) {
  const { data, isLoading, isError, refetch } =
    trpc.snapshot.getFeaturedClips.useQuery({
      creatorProfileId: profile.id,
      limit: 6,
    });

  if (isError)
    return (
      <WidgetQueryError label="featured clips" onRetry={() => void refetch()} />
    );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="aspect-video animate-pulse rounded-lg bg-n-surface"
          />
        ))}
      </div>
    );
  }

  if (!data?.hasTwitch || data.clips.length === 0) {
    return <EmptyWidgetSentinel />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {data.clips.map((clip) => (
        <a
          key={clip.id}
          href={clip.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group overflow-hidden rounded-lg border border-n-line transition-colors hover:border-n-control"
        >
          {/* Thumbnail */}
          <div className="relative aspect-video bg-n-canvas">
            <Image
              src={clip.thumbnailUrl}
              alt={clip.title}
              fill
              sizes="(max-width: 640px) 50vw, 33vw"
              className="object-cover transition-transform group-hover:scale-105"
              loading="lazy"
              unoptimized
            />
            {/* View count badge */}
            <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {formatNumber(clip.viewCount)} views
            </span>
          </div>

          {/* Info */}
          <div className="p-4">
            <p className="line-clamp-2 text-sm font-semibold text-n-ink">
              {clip.title}
            </p>
            <p className="mt-2 text-xs text-n-slate">
              {formatRelativeTime(clip.createdAt)}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}
