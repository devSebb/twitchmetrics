import type { Metadata } from "next";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { formatNumber } from "@/lib/utils/format";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { GameSortControls } from "@/components/games/GameSortControls";
import { GameGrid } from "@/components/games/GameGrid";
import { Suspense } from "react";

export const revalidate = 300; // ISR: revalidate every 5 minutes

export const metadata: Metadata = {
  title: "Top Games",
  description:
    "Browse the most-watched games on Twitch, YouTube, and Kick with live viewership data and channel counts.",
  openGraph: {
    title: `Top Games | ${SITE_NAME}`,
    description:
      "Browse the most-watched games with live viewership data across all streaming platforms.",
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

async function getGames(sort: SortOption) {
  const orderBy =
    sort === "channels"
      ? { currentChannels: "desc" as const }
      : sort === "hoursWatched"
        ? { hoursWatched7d: "desc" as const }
        : { currentViewers: "desc" as const };

  const [games, total] = await Promise.all([
    db.game.findMany({ orderBy, take: 20 }),
    db.game.count(),
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

type PageProps = {
  searchParams: Promise<{ sort?: string }>;
};

export default async function GamesPage({ searchParams }: PageProps) {
  const { sort: sortParam } = await searchParams;
  const sort = (
    ["viewers", "channels", "hoursWatched"].includes(sortParam ?? "")
      ? sortParam
      : "viewers"
  ) as SortOption;

  const { games, total } = await getGames(sort);
  const totalPages = Math.ceil(total / 20);

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

      <Suspense>
        <GameGrid
          initialData={games}
          initialMeta={{ total, page: 1, limit: 20, totalPages }}
        />
      </Suspense>
    </div>
  );
}
