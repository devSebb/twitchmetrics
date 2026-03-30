import type { Metadata } from "next";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { formatNumber } from "@/lib/utils/format";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { GameSortControls } from "@/components/games/GameSortControls";
import { GameGrid } from "@/components/games/GameGrid";
import { GenreFilter } from "@/components/games/GenreFilter";
import { Suspense } from "react";

export const revalidate = 300; // ISR: revalidate every 5 minutes

export const metadata: Metadata = {
  title: "Top Games",
  description:
    "Browse the most-watched games on Twitch with live viewership data and channel counts.",
  openGraph: {
    title: `Top Games | ${SITE_NAME}`,
    description:
      "Browse the most-watched games on Twitch with live viewership data and channel counts.",
    type: "website",
    url: `${SITE_URL}/games`,
  },
  twitter: {
    card: "summary",
    site: TWITTER_HANDLE,
    title: `Top Games | ${SITE_NAME}`,
  },
  alternates: { canonical: `${SITE_URL}/games` },
};

type SortOption = "viewers" | "channels" | "hoursWatched";

async function getGames(sort: SortOption, genre?: string) {
  const orderBy =
    sort === "channels"
      ? { currentChannels: "desc" as const }
      : sort === "hoursWatched"
        ? { hoursWatched7d: "desc" as const }
        : { currentViewers: "desc" as const };

  const [games, total] = await Promise.all([
    genre
      ? db.game.findMany({
          where: { genres: { has: genre } },
          orderBy,
          take: 20,
        })
      : db.game.findMany({ orderBy, take: 20 }),
    genre
      ? db.game.count({ where: { genres: { has: genre } } })
      : db.game.count(),
  ]);

  return {
    games: serializeBigInt(games) as {
      id: string;
      name: string;
      slug: string;
      coverImageUrl: string | null;
      currentViewers: number;
      currentChannels: number;
      genres: string[];
    }[],
    total,
  };
}

async function getAllGenres(): Promise<string[]> {
  const rows = await db.game.findMany({
    select: { genres: true },
    where: { genres: { isEmpty: false } },
  });
  const all = rows.flatMap((r) => r.genres);
  return [...new Set(all)].sort();
}

type PageProps = {
  searchParams: Promise<{ sort?: string; genre?: string }>;
};

export default async function GamesPage({ searchParams }: PageProps) {
  const { sort: sortParam, genre } = await searchParams;
  const sort = (
    ["viewers", "channels", "hoursWatched"].includes(sortParam ?? "")
      ? sortParam
      : "viewers"
  ) as SortOption;

  const [{ games, total }, allGenres] = await Promise.all([
    getGames(sort, genre),
    getAllGenres(),
  ]);
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-[#F2F3F5]">Top Games</h1>
          <p className="mt-2 text-sm text-[#949BA4]">
            Track the most-watched games on Twitch with live audience data,
            channel counts, and quick genre filtering.
          </p>
        </div>
        <span className="text-sm text-[#949BA4]">
          {formatNumber(total)} games
        </span>
      </div>

      <Suspense>
        <div className="mb-4">
          <GameSortControls />
        </div>
      </Suspense>

      <Suspense>
        <div className="mb-6">
          <GenreFilter genres={allGenres} />
        </div>
      </Suspense>

      <Suspense>
        <GameGrid
          initialData={games}
          initialMeta={{ total, page: 1, limit: 20, totalPages }}
        />
      </Suspense>
    </div>
  );
}
