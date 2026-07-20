"use client";

import { trpc } from "@/lib/trpc";
import { PopularGames } from "./PopularGames";

type Props = {
  creatorProfileId: string;
};

export function PopularGamesSection({ creatorProfileId }: Props) {
  const { data, isLoading } = trpc.snapshot.getPopularGames.useQuery({
    creatorProfileId,
    limit: 6,
  });

  if (isLoading) {
    return (
      <div className="mt-6">
        <div className="mb-3 h-6 w-36 animate-pulse rounded bg-[#383A40]" />
        <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-4">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-12 w-9 animate-pulse rounded bg-[#383A40]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-[#383A40]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[#383A40]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const games = (data ?? []).map((g) => ({
    name: g.gameName,
    slug: g.slug,
    coverImageUrl: g.coverImageUrl,
    avgViewers: g.avgViewers,
    airtimeMinutes: g.airtimeMinutes,
    observationCount: g.observationCount,
    measurement: g.measurement,
  }));

  return <PopularGames games={games} />;
}
