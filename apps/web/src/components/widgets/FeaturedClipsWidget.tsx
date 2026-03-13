"use client";

import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { formatNumber, formatRelativeTime } from "@/lib/utils/format";
import { EmptyState } from "./EmptyState";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

type Props = {
  profile: SerializedProfile;
};

export function FeaturedClipsWidget({ profile }: Props) {
  const { data, isLoading } = trpc.snapshot.getFeaturedClips.useQuery({
    creatorProfileId: profile.id,
    limit: 6,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="aspect-video animate-pulse rounded-lg bg-[#383A40]"
          />
        ))}
      </div>
    );
  }

  if (!data?.hasTwitch) {
    return (
      <EmptyState
        variant="no_data"
        title="No Twitch Account"
        message="Connect Twitch to see clips."
        compact
      />
    );
  }

  if (data.clips.length === 0) {
    return (
      <EmptyState
        variant="no_data"
        title="No Clips"
        message="Unable to load clips. Try again later."
        compact
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {data.clips.map((clip) => (
        <a
          key={clip.id}
          href={clip.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group overflow-hidden rounded-lg border border-[#3F4147] transition-colors hover:border-[#4E5058]"
        >
          {/* Thumbnail */}
          <div className="relative aspect-video bg-[#2B2D31]">
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
          <div className="p-2">
            <p className="line-clamp-2 text-xs font-medium text-[#DBDEE1]">
              {clip.title}
            </p>
            <p className="mt-1 text-[10px] text-[#949BA4]">
              {formatRelativeTime(clip.createdAt)}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}
