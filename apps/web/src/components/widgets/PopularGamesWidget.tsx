"use client";

import Image from "next/image";
import Link from "next/link";
import { EmptyState } from "@/components/widgets/EmptyState";
import { trpc } from "@/lib/trpc";
import { formatNumber } from "@/lib/utils/format";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

type PopularGamesWidgetProps = {
  profile: SerializedProfile;
};

export function PopularGamesWidget({ profile }: PopularGamesWidgetProps) {
  const { data: games, isLoading } = trpc.snapshot.getPopularGames.useQuery({
    creatorProfileId: profile.id,
    limit: 6,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-[#383A40]" />
        ))}
      </div>
    );
  }

  if (!games || games.length === 0) {
    return (
      <EmptyState
        variant="no_data"
        title="No streaming data"
        message="No streaming data yet. Games will appear once streams are recorded."
        compact
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {games.map((game) => (
        <GameCard key={game.gameName} game={game} />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------
// Game card row
// ----------------------------------------------------------------

type GameCardProps = {
  game: {
    gameName: string;
    streamCount: number;
    avgViewers: number;
    slug: string | null;
    coverImageUrl: string | null;
  };
};

function GameCard({ game }: GameCardProps) {
  const content = (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[#383A40]">
      {/* Cover image */}
      <div className="h-10 w-8 flex-shrink-0 overflow-hidden rounded bg-[#2B2D31]">
        {game.coverImageUrl ? (
          <Image
            src={game.coverImageUrl}
            alt={game.gameName}
            width={32}
            height={40}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-[#949BA4]">
            ?
          </div>
        )}
      </div>

      {/* Game info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#DBDEE1]">
          {game.gameName}
        </p>
        <div className="flex items-center gap-3 text-xs text-[#949BA4]">
          <span>
            <span className="text-[#F2F3F5]">
              {formatNumber(game.avgViewers)}
            </span>{" "}
            avg viewers
          </span>
          <span>{game.streamCount} streams</span>
        </div>
      </div>
    </div>
  );

  if (game.slug) {
    return (
      <Link href={`/games/${game.slug}`} className="block">
        {content}
      </Link>
    );
  }

  return content;
}
