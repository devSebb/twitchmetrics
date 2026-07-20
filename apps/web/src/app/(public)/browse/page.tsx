import type { Metadata } from "next";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { formatNumber } from "@/lib/utils/format";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { VERTICAL_LABELS } from "@/lib/constants/categories";
import {
  normalizeGameListFilters,
  normalizeGameVertical,
  type GameVerticalFilter,
} from "@/lib/game-list";
import { listPublicGames } from "@/server/services/public-game-list";
import { GameSortControls } from "@/components/games/GameSortControls";
import { GameGrid } from "@/components/games/GameGrid";
import { GenreFilter } from "@/components/games/GenreFilter";
import { VerticalPills } from "@/components/browse/VerticalPills";
import { Suspense } from "react";

export const revalidate = 300;

function verticalCopy(vertical: GameVerticalFilter): {
  title: string;
  description: string;
  noun: string;
} {
  if (vertical === "all") {
    return {
      title: "Top Categories",
      description:
        "Browse every category on Twitch — gaming, IRL, music, and more — ranked by the latest observed viewers.",
      noun: "categories",
    };
  }
  if (vertical === "gaming") {
    return {
      title: "Top Games",
      description:
        "Browse the most-watched games on Twitch with the latest observed viewership and channel counts.",
      noun: "games",
    };
  }
  const label = VERTICAL_LABELS[vertical];
  return {
    title: `Top ${label}`,
    description: `Browse the most-watched ${label} categories on Twitch with the latest observed viewership and channel counts.`,
    noun: "categories",
  };
}

type PageProps = {
  searchParams: Promise<{
    sort?: string;
    genre?: string;
    vertical?: string;
  }>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const { vertical: verticalParam } = await searchParams;
  const vertical = normalizeGameVertical(verticalParam);
  const { title, description } = verticalCopy(vertical);
  const url =
    vertical === "gaming"
      ? `${SITE_URL}/browse`
      : `${SITE_URL}/browse?vertical=${vertical}`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      type: "website",
      url,
    },
    twitter: {
      card: "summary",
      site: TWITTER_HANDLE,
      title: `${title} | ${SITE_NAME}`,
    },
    alternates: { canonical: url },
  };
}

async function getGenresForVertical(
  vertical: GameVerticalFilter,
): Promise<string[]> {
  if (vertical !== "gaming") return [];
  const rows = await db.game.findMany({
    select: { genres: true },
    where: { vertical: "gaming", genres: { isEmpty: false } },
  });
  const all = rows.flatMap((r) => r.genres);
  return [...new Set(all)].sort();
}

export default async function BrowsePage({ searchParams }: PageProps) {
  const {
    sort: sortParam,
    genre,
    vertical: verticalParam,
  } = await searchParams;

  const filters = normalizeGameListFilters({
    sort: sortParam,
    vertical: verticalParam,
    genre,
  });
  const { vertical } = filters;

  const [{ games, total }, genres] = await Promise.all([
    listPublicGames(filters),
    getGenresForVertical(vertical),
  ]);
  const serializedGames = serializeBigInt(games) as {
    id: string;
    name: string;
    slug: string;
    coverImageUrl: string | null;
    currentViewers: number;
    currentChannels: number;
    genres: string[];
  }[];
  const totalPages = Math.ceil(total / filters.limit);
  const { title, description, noun } = verticalCopy(vertical);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Suspense>
        <div className="mb-6">
          <VerticalPills />
        </div>
      </Suspense>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-[#F2F3F5]">{title}</h1>
          <p className="mt-2 text-sm text-[#949BA4]">{description}</p>
        </div>
        <span className="text-sm text-[#949BA4]">
          {formatNumber(total)} {noun}
        </span>
      </div>

      <Suspense>
        <div className="mb-4">
          <GameSortControls />
        </div>
      </Suspense>

      {vertical === "gaming" && genres.length > 0 && (
        <Suspense>
          <div className="mb-6">
            <GenreFilter genres={genres} />
          </div>
        </Suspense>
      )}

      <Suspense>
        <GameGrid
          initialData={serializedGames}
          initialMeta={{
            total,
            page: filters.page,
            limit: filters.limit,
            totalPages,
          }}
        />
      </Suspense>
    </div>
  );
}
