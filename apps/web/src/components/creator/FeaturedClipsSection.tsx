"use client";

import { FilmSlate } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { trpc } from "@/lib/trpc";
import { FeaturedClips } from "./FeaturedClips";

type Props = {
  creatorProfileId: string;
};

export function FeaturedClipsSection({ creatorProfileId }: Props) {
  const { data, isLoading } = trpc.snapshot.getFeaturedClips.useQuery({
    creatorProfileId,
    limit: 6,
  });

  if (isLoading) {
    return (
      <div className="mt-6">
        <div className="mb-3 h-6 w-36 animate-pulse rounded bg-[#383A40]" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-video animate-pulse rounded-lg bg-[#383A40]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!data?.hasTwitch) {
    return (
      <div className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#F2F3F5]">
          <FilmSlate size={20} weight="duotone" className="text-[#949BA4]" />
          Featured Clips
        </h2>
        <Card className="flex items-center justify-center py-10">
          <p className="text-sm text-[#949BA4]">No Twitch account linked</p>
        </Card>
      </div>
    );
  }

  return <FeaturedClips clips={data.clips} />;
}
