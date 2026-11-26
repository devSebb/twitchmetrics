import { Container } from "@/components/ui/Editorial";
import { AppearanceProvider } from "@/components/ui/Appearance";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Platform } from "@twitchmetrics/database";
import { formatNumber } from "@/lib/utils/format";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import {
  listPublicCreators,
  ListOffsetOutOfRangeError,
  type CreatorListSort,
} from "@/server/services/creator-list";
import {
  getTopGameFilters,
  resolveGameFilter,
  type GameFilter,
} from "@/server/services/creator-ranking";
import {
  CreatorGameFilter,
  CreatorNavigationProvider,
  CreatorPlatformPills,
  CreatorSortControls,
  CreatorViewToggle,
  CreatorGrid,
} from "@/components/creators";

export const revalidate = 300; // ISR: revalidate every 5 minutes

/** Page size for the /creators grid. */
const PER_PAGE = 32;

type SortOption = CreatorListSort;

const VALID_PLATFORMS = new Set<Platform>([
  "twitch",
  "youtube",
  "instagram",
  "tiktok",
  "x",
  "kick",
]);

function parsePlatform(value?: string): Platform | undefined {
  if (!value) return undefined;
  return VALID_PLATFORMS.has(value as Platform)
    ? (value as Platform)
    : undefined;
}

function parseSort(value?: string): SortOption {
  return value === "trending" ||
    value === "recent" ||
    value === "viewership" ||
    value === "peak"
    ? value
    : "followers";
}

function parsePage(value?: string): number {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  kick: "Kick",
};

/** Platforms where "Streamers" is the right noun; social platforms and the
 * unfiltered followers list say "Creators". */
const STREAMING_PLATFORMS: ReadonlySet<Platform> = new Set([
  "twitch",
  "youtube",
  "kick",
]);

function monthStamp(): string {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${month} ${now.getUTCFullYear()}`;
}

/**
 * Ranking titles. Followers are the latest counts, so that title keeps the
 * month stamp of the legacy twitchmetrics.net pattern ("The Most Followed
 * Twitch Streamers, August 2026"). Viewership and peak cover the last 30
 * complete days and say so: under a month stamp they read as a calendar-month
 * ranking, which they are not (Stream Hatchet review, 2026-11-25).
 * Trending/recent keep the generic title.
 */
function rankingTitle(
  sort: SortOption,
  platform: Platform | undefined,
  game: GameFilter | null,
): string {
  if (sort === "trending" || sort === "recent") return "Top Creators";
  // Instagram, TikTok and X have no viewership; the list falls back to
  // followers there, and so does the title.
  if (
    platform &&
    !STREAMING_PLATFORMS.has(platform) &&
    (sort === "viewership" || sort === "peak")
  ) {
    sort = "followers";
  }
  const subject = game
    ? `${game.name} Streamers`
    : platform
      ? `${PLATFORM_LABELS[platform]} ${STREAMING_PLATFORMS.has(platform) ? "Streamers" : "Creators"}`
      : sort === "followers"
        ? "Creators"
        : "Streamers";
  const stamp = monthStamp();
  if (sort === "viewership") return `The Most Watched ${subject}, Last 30 Days`;
  if (sort === "peak") return `Top ${subject} by Peak Viewers, Last 30 Days`;
  return `The Most Followed ${subject}, ${stamp}`;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const {
    platform: platformParam,
    sort: sortParam,
    page: pageParam,
    game: gameParam,
  } = await searchParams;
  const platform = parsePlatform(platformParam);
  const sort = parseSort(sortParam);
  const page = parsePage(pageParam);
  const game = await resolveGameFilter(gameParam);

  // Canonical: page 1 keeps the clean URL; deeper pages self-canonicalize so
  // Google crawls the full catalog. Platform- and game-filtered lists are
  // distinct content, so those params stay in the canonical. The default sort
  // ("followers") is omitted; unknown game slugs are ignored entirely.
  const params = new URLSearchParams();
  if (platform) params.set("platform", platform);
  if (sort !== "followers") params.set("sort", sort);
  if (game) params.set("game", game.slug);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  const url = query ? `${SITE_URL}/creators?${query}` : `${SITE_URL}/creators`;

  const baseTitle = rankingTitle(sort, platform, game);
  const title = page > 1 ? `${baseTitle} - Page ${page}` : baseTitle;
  const description = game
    ? `Browse the most watched ${game.name} streamers ranked by recent viewership. Updated follower snapshots and growth trends.`
    : "Browse the top creators across Twitch, YouTube, Instagram, TikTok, and more. Latest follower snapshots and growth trends.";

  return {
    title,
    description,
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description:
        "Browse the top creators across Twitch, YouTube, Instagram, TikTok, and more.",
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

type PageProps = {
  searchParams: Promise<{
    platform?: string;
    sort?: string;
    page?: string;
    game?: string;
  }>;
};

function ItemListJsonLd({
  creators,
  page,
  perPage,
}: {
  creators: Array<{ slug: string; displayName: string }>;
  page: number;
  perPage: number;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: creators.map((creator, i) => ({
      "@type": "ListItem",
      position: (page - 1) * perPage + i + 1,
      url: `${SITE_URL}/creator/${creator.slug}`,
      name: creator.displayName,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default async function CreatorsPage({ searchParams }: PageProps) {
  const {
    platform: platformParam,
    sort: sortParam,
    page: pageParam,
    game: gameParam,
  } = await searchParams;
  const platform = parsePlatform(platformParam);
  const sort = parseSort(sortParam);
  const page = parsePage(pageParam);
  const game = await resolveGameFilter(gameParam);
  // Same service (and same Redis key) that GET /api/creators uses, so the
  // server render and CreatorGrid's follow-up fetch agree and share a cache
  // entry. view is "grid" here: the list view's extra streaming stats are
  // only ever requested by the client.
  // Pages past the offset cap 404 rather than paying a ~1 s offset scan for a
  // crawler (see MAX_LIST_OFFSET); canonicals already self-reference.
  const [{ data: initialCreators, meta: initialMeta }, topGames] =
    await Promise.all([
      listPublicCreators({
        page,
        limit: PER_PAGE,
        sort,
        platform: platform ?? null,
        game,
        query: null,
        view: "grid",
      }).catch((error) => {
        if (error instanceof ListOffsetOutOfRangeError) notFound();
        throw error;
      }),
      getTopGameFilters(),
    ]);
  const total = initialMeta.total;

  const heading =
    sort === "trending" || sort === "recent"
      ? "Top Channels"
      : rankingTitle(sort, platform, game);

  return (
    <AppearanceProvider>
      <div className="noticed min-h-[60vh]">
        <Container className="py-10 sm:py-16">
          <ItemListJsonLd
            creators={initialCreators}
            page={page}
            perPage={PER_PAGE}
          />

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="n-eyebrow mb-4 text-n-slate">Explore channels</p>
              <h1 className="text-[clamp(2rem,4.5vw,4rem)] font-extrabold leading-tight tracking-[-.045em] text-n-ink">
                {heading}
              </h1>
              <p className="mt-2 text-sm text-n-slate">
                Browse creator profiles by platform, follow growth momentum, and
                sort the directory by scale or recent movement.
              </p>
            </div>
            <span className="text-sm text-n-slate">
              {formatNumber(total)} channels
            </span>
          </div>

          <CreatorNavigationProvider>
            <Suspense>
              <div className="mb-6">
                <CreatorPlatformPills />
              </div>
            </Suspense>

            <Suspense>
              <div className="mb-8 flex flex-wrap items-center gap-4 border-y border-n-line py-5">
                <CreatorViewToggle />
                <CreatorGameFilter games={topGames} activeGame={game} />
                <CreatorSortControls />
              </div>
            </Suspense>

            <Suspense>
              <CreatorGrid
                initialData={initialCreators}
                initialMeta={initialMeta}
                initialFilters={{
                  platform: platform ?? "",
                  sort,
                  game: game?.slug ?? "",
                  page,
                }}
              />
            </Suspense>
          </CreatorNavigationProvider>
        </Container>
      </div>
    </AppearanceProvider>
  );
}
