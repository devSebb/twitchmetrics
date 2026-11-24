"use client";
import { WidgetQueryError } from "./WidgetQueryError";

import Link from "next/link";
import type { Platform } from "@twitchmetrics/database";
import { PlatformIcon } from "@/components/shared";
import { EmptyWidgetSentinel } from "@/components/dashboard/WidgetCard";
import { trpc } from "@/lib/trpc";
import { formatDuration, formatNumber } from "@/lib/utils/format";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";
import { GameCoverImage } from "@/components/games/GameCoverImage";

type PopularGamesWidgetProps = {
  profile: SerializedProfile;
};

export function PopularGamesWidget({ profile }: PopularGamesWidgetProps) {
  const {
    data: games,
    isLoading,
    isError,
    refetch,
  } = trpc.snapshot.getPopularGames.useQuery({
    creatorProfileId: profile.id,
    limit: 6,
  });

  if (isError)
    return (
      <WidgetQueryError
        label="popular categories"
        onRetry={() => void refetch()}
      />
    );

  if (isLoading) {
    return (
      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-n-surface" />
        ))}
      </div>
    );
  }

  if (!games || games.length === 0) {
    return <EmptyWidgetSentinel />;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
    observationCount: number;
    airtimeMinutes: number;
    avgViewers: number;
    measurement: "measured" | "observed" | "mixed";
    slug: string | null;
    coverImageUrl: string | null;
    platforms?: Platform[];
  };
};

function GameCard({ game }: GameCardProps) {
  const content = (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-n-surface">
      {/* Cover image */}
      <div className="relative h-10 w-8 flex-shrink-0 overflow-hidden rounded bg-n-canvas">
        <GameCoverImage
          src={game.coverImageUrl}
          name={game.gameName}
          sizes="32px"
          className="object-cover"
          fallbackClassName="[&>span]:hidden"
          unoptimized
        />
      </div>

      {/* Game info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-n-ink">
            {game.gameName}
          </p>
          {game.platforms && game.platforms.length > 0 && (
            <div className="flex flex-shrink-0 items-center gap-1">
              {game.platforms.map((platform) => (
                <PlatformIcon
                  key={platform}
                  platform={platform}
                  size="xs"
                  rounded="full"
                  className="h-3.5 w-3.5"
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-n-slate">
          <span>
            <span className="text-n-ink">{formatNumber(game.avgViewers)}</span>{" "}
            Avg Viewers
          </span>
          {game.measurement === "observed" ? (
            <span>
              {formatNumber(game.observationCount)} live{" "}
              {game.observationCount === 1 ? "observation" : "observations"}
            </span>
          ) : (
            <span>Airtime {formatDuration(game.airtimeMinutes * 60)}</span>
          )}
        </div>
      </div>
    </div>
  );

  if (game.slug) {
    return (
      <Link href={`/game/${game.slug}`} className="block">
        {content}
      </Link>
    );
  }

  return content;
}
