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
import { Container } from "@/components/ui/Editorial";

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
        "Explore gaming, IRL, music and more across Twitch, Kick and YouTube. Compare categories using the latest observed viewers and channel counts.",
      noun: "categories",
    };
  }
  if (vertical === "gaming") {
    return {
      title: "Top Games",
      description:
        "Browse the most-watched games on Twitch, Kick and YouTube with the latest observed viewership and channel counts.",
      noun: "games",
    };
  }
  const label = VERTICAL_LABELS[vertical];
  return {
    title: `Top ${label}`,
    description: `Browse the most-watched ${label} categories on Twitch, Kick and YouTube with the latest observed viewership and channel counts.`,
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

function ItemListJsonLd({
  games,
  page,
  perPage,
}: {
  games: Array<{ slug: string; name: string }>;
  page: number;
  perPage: number;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: games.map((game, i) => ({
      "@type": "ListItem",
      position: (page - 1) * perPage + i + 1,
      url: `${SITE_URL}/game/${game.slug}`,
      name: game.name,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
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
    <div className="noticed min-h-screen">
      <Container className="py-10 sm:py-16">
        <ItemListJsonLd
          games={serializedGames}
          page={filters.page}
          perPage={filters.limit}
        />
        <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="n-eyebrow text-n-slate">Explore categories</p>
            <h1 className="mt-4 text-[clamp(2rem,5vw,4.5rem)] font-extrabold leading-[1.05] tracking-[-.05em]">
              {title}
              <span className="text-n-red">.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-n-slate">
              {description}
            </p>
          </div>
          <span className="shrink-0 text-sm text-n-slate">
            {formatNumber(total)} {noun}
          </span>
        </div>

        <Suspense>
          <div className="border-y border-n-line py-5">
            <VerticalPills />
          </div>
        </Suspense>

        <Suspense>
          <div className="py-6">
            <GameSortControls />
          </div>
        </Suspense>

        {vertical === "gaming" && genres.length > 0 && (
          <Suspense>
            <div className="mb-8">
              <GenreFilter genres={genres} />
            </div>
          </Suspense>
        )}

        <Suspense>
          <GameGrid
            initialFilters={filters}
            initialData={serializedGames}
            initialMeta={{
              total,
              page: filters.page,
              limit: filters.limit,
              totalPages,
            }}
          />
        </Suspense>
      </Container>
    </div>
  );
}
