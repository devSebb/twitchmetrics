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
            className="aspect-video animate-pulse rounded-lg bg-[var(--view-surface,#383A40)]"
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
          className="group overflow-hidden rounded-lg border border-[var(--view-line,#3F4147)] transition-colors hover:border-[var(--view-control,#4E5058)]"
        >
          {/* Thumbnail */}
          <div className="relative aspect-video bg-[var(--view-canvas,#2B2D31)]">
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
            <p className="line-clamp-2 text-sm font-semibold text-[var(--view-ink,#DBDEE1)]">
              {clip.title}
            </p>
            <p className="mt-2 text-xs text-[var(--view-muted,#949BA4)]">
              {formatRelativeTime(clip.createdAt)}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}
