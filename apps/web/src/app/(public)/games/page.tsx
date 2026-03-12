import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { formatNumber } from "@/lib/utils/format";
import { Badge } from "@/components/ui/Badge";
import { GameSortControls } from "@/components/games/GameSortControls";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Top Games | TwitchMetrics",
  description:
    "Browse the most-watched games on Twitch, YouTube, and Kick with live viewership data.",
};

type SortOption = "viewers" | "channels" | "hoursWatched";

async function getGames(sort: SortOption) {
  const orderBy =
    sort === "channels"
      ? { currentChannels: "desc" as const }
      : sort === "hoursWatched"
        ? { hoursWatched7d: "desc" as const }
        : { currentViewers: "desc" as const };

  const [games, total] = await Promise.all([
    db.game.findMany({
      orderBy,
      take: 20,
    }),
    db.game.count(),
  ]);

  return { games: serializeBigInt(games), total };
}

type PageProps = {
  searchParams: Promise<{ sort?: string; page?: string }>;
};

export default async function GamesPage({ searchParams }: PageProps) {
  const { sort: sortParam } = await searchParams;
  const sort = (
    ["viewers", "channels", "hoursWatched"].includes(sortParam ?? "")
      ? sortParam
      : "viewers"
  ) as SortOption;

  const { games, total } = await getGames(sort);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-[#F2F3F5]">Top Games</h1>
        <span className="text-sm text-[#949BA4]">
          {formatNumber(total)} games
        </span>
      </div>

      <Suspense>
        <div className="mb-6">
          <GameSortControls />
        </div>
      </Suspense>

      {games.length === 0 && (
        <div className="rounded-lg border border-[#3F4147] bg-[#313338] px-6 py-10 text-center">
          <p className="text-sm text-[#949BA4]">No games found</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {games.map(
          (game: {
            id: string;
            name: string;
            slug: string;
            coverImageUrl: string | null;
            currentViewers: number;
            currentChannels: number;
            genres: string[];
          }) => (
            <Link
              key={game.id}
              href={`/game/${game.slug}`}
              className="group overflow-hidden rounded-lg border border-[#3F4147] bg-[#313338] transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
            >
              {/* Cover art */}
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#1E1F22]">
                {game.coverImageUrl ? (
                  <Image
                    src={game.coverImageUrl}
                    alt={game.name}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#E32C19]/20 to-[#1E1F22]">
                    <span className="text-3xl font-bold text-[#949BA4]">
                      {game.name.charAt(0)}
                    </span>
                  </div>
                )}
                {/* Viewer badge overlay */}
                <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                  {formatNumber(game.currentViewers)} viewers
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <div className="truncate text-sm font-semibold text-[#F2F3F5]">
                  {game.name}
                </div>
                <div className="mt-1 text-xs text-[#949BA4]">
                  {formatNumber(game.currentChannels)} channels
                </div>
                {game.genres.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {game.genres.slice(0, 2).map((genre: string) => (
                      <Badge key={genre} variant="outline">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
