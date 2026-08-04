import type { Metadata } from "next";
import { Suspense } from "react";
import { Platform, Prisma } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { isKnownGrowthRollup } from "@/server/services/creator-growth";
import { formatNumber } from "@/lib/utils/format";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import {
  DISCOVERABLE_CREATOR_SQL,
  DISCOVERABLE_CREATOR_WHERE,
} from "@/server/services/creator-visibility";
import {
  getTopGameFilters,
  getViewershipRankedIds,
  hasViewershipData,
  isViewershipSort,
  resolveGameFilter,
  type GameFilter,
} from "@/server/services/creator-ranking";
import {
  CreatorGameFilter,
  CreatorPlatformPills,
  CreatorSortControls,
  CreatorViewToggle,
  CreatorGrid,
} from "@/components/creators";

export const revalidate = 300; // ISR: revalidate every 5 minutes

type SortOption = "followers" | "viewership" | "peak" | "trending" | "recent";
type CreatorRecord = Prisma.CreatorProfileGetPayload<{
  include: {
    platformAccounts: true;
    growthRollups: {
      orderBy: { computedAt: "desc" };
    };
  };
}>;

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
 * Month-stamped ranking titles matching the legacy twitchmetrics.net pattern
 * ("The Most Watched Twitch Streamers, August 2026") — the stamp regenerates
 * monthly as a freshness signal. Trending/recent keep the generic title.
 */
function rankingTitle(
  sort: SortOption,
  platform: Platform | undefined,
  game: GameFilter | null,
): string {
  if (sort === "trending" || sort === "recent") return "Top Creators";
  const subject = game
    ? `${game.name} Streamers`
    : platform
      ? `${PLATFORM_LABELS[platform]} ${STREAMING_PLATFORMS.has(platform) ? "Streamers" : "Creators"}`
      : sort === "followers"
        ? "Creators"
        : "Streamers";
  const stamp = monthStamp();
  if (sort === "viewership") return `The Most Watched ${subject}, ${stamp}`;
  if (sort === "peak") return `Top ${subject} by Peak Viewers, ${stamp}`;
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

async function getCreators({
  platform,
  sort,
  page,
  game,
}: {
  platform: Platform | undefined;
  sort: SortOption;
  page: number;
  game: GameFilter | null;
}) {
  const take = 32;
  const skip = (page - 1) * take;

  // Viewership/peak rank from Stream Hatchet daily rollups; platforms without
  // stream data (instagram/tiktok/x) fall back to the followers ordering.
  const effectiveSort =
    isViewershipSort(sort) && !hasViewershipData(platform) ? "followers" : sort;

  let ids: string[];
  if (isViewershipSort(effectiveSort)) {
    ids = await getViewershipRankedIds({
      sort: effectiveSort,
      platform,
      gameName: game?.name ?? null,
      take,
      skip,
    });
  } else {
    // Platform filtering joins PlatformAccount (unique on creatorProfileId +
    // platform, so no row fanout) so ranking can use that platform's own count
    // instead of the cross-platform total.
    const joinClause = platform
      ? Prisma.sql`
          JOIN "PlatformAccount" pa
            ON pa."creatorProfileId" = cp.id
           AND pa.platform = ${platform}::"Platform"
        `
      : Prisma.empty;
    const gameClause = game
      ? Prisma.sql` AND cp."primaryGameSlug" = ${game.slug}`
      : Prisma.empty;
    const whereClause = Prisma.sql`WHERE ${DISCOVERABLE_CREATOR_SQL}${gameClause}`;
    // YouTube stores audience size in subscriberCount, others in followerCount.
    const platformFollowersSql = Prisma.sql`COALESCE(pa."followerCount", pa."subscriberCount")`;
    const orderClause =
      effectiveSort === "trending"
        ? Prisma.sql`
            ORDER BY COALESCE(
              (
                SELECT cgr."delta7d"
                FROM "CreatorGrowthRollup" cgr
                WHERE cgr."creatorProfileId" = cp.id
                  AND cgr.platform = ${platform ? Prisma.sql`${platform}::"Platform"` : Prisma.sql`cp."primaryPlatform"`}
                LIMIT 1
              ),
              0
            ) DESC, ${platform ? Prisma.sql`${platformFollowersSql} DESC NULLS LAST` : Prisma.sql`cp."totalFollowers" DESC`}
          `
        : effectiveSort === "recent"
          ? Prisma.sql`ORDER BY cp."createdAt" DESC`
          : platform
            ? Prisma.sql`ORDER BY ${platformFollowersSql} DESC NULLS LAST, cp."totalFollowers" DESC`
            : Prisma.sql`ORDER BY cp."totalFollowers" DESC`;

    const idRows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT cp.id
      FROM "CreatorProfile" cp
      ${joinClause}
      ${whereClause}
      ${orderClause}
      LIMIT ${take}
      OFFSET ${skip}
    `);
    ids = idRows.map((row) => row.id);
  }

  // Count: game-filtered totals use the primary-game cohort (approximate for
  // viewership sorts, which rank by who streamed the game recently).
  const countWhere = {
    ...DISCOVERABLE_CREATOR_WHERE,
    ...(game ? { primaryGameSlug: game.slug } : {}),
    ...(platform ? { platformAccounts: { some: { platform } } } : {}),
  };

  const [creators, countResult]: [CreatorRecord[], number] = await Promise.all([
    ids.length
      ? db.creatorProfile.findMany({
          where: { ...DISCOVERABLE_CREATOR_WHERE, id: { in: ids } },
          include: {
            platformAccounts: true,
            growthRollups: {
              orderBy: { computedAt: "desc" },
            },
          },
        })
      : Promise.resolve([] as CreatorRecord[]),
    db.creatorProfile.count({ where: countWhere }),
  ]);

  const creatorById = new Map(creators.map((creator) => [creator.id, creator]));

  const data = ids
    .map((id) => creatorById.get(id))
    .filter((creator): creator is NonNullable<typeof creator> =>
      Boolean(creator),
    )
    .map((creator) => {
      // On a platform tab, trend and follower count both come from that
      // platform (matching the sort); no cross-platform fallback.
      const rollupRow = platform
        ? (creator.growthRollups.find((r) => r.platform === platform) ?? null)
        : (creator.growthRollups.find(
            (r) => r.platform === creator.primaryPlatform,
          ) ??
          creator.growthRollups[0] ??
          null);
      // Null delta/pct = no comparison snapshot — render as missing data.
      const growthRollup =
        rollupRow && isKnownGrowthRollup(rollupRow) ? rollupRow : null;

      const platformAccount = platform
        ? creator.platformAccounts.find((a) => a.platform === platform)
        : undefined;
      const displayFollowers = platformAccount
        ? (platformAccount.followerCount ??
          platformAccount.subscriberCount ??
          0n)
        : creator.totalFollowers;

      return {
        displayName: creator.displayName,
        slug: creator.slug,
        avatarUrl: creator.avatarUrl,
        totalFollowers: creator.totalFollowers.toString(),
        displayFollowers: displayFollowers.toString(),
        primaryPlatform: creator.primaryPlatform,
        platformAccounts: creator.platformAccounts.map((a) => ({
          platform: a.platform,
          platformUsername: a.platformUsername,
        })),
        growthRollup: growthRollup
          ? {
              delta7d: growthRollup.delta7d.toString(),
              pct7d: growthRollup.pct7d,
              trendDirection: growthRollup.trendDirection,
            }
          : null,
      };
    });

  return { data, total: countResult };
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
  const [{ data: initialCreators, total }, topGames] = await Promise.all([
    getCreators({
      platform,
      sort,
      page,
      game,
    }),
    getTopGameFilters(),
  ]);

  const heading =
    sort === "trending" || sort === "recent"
      ? "Top Channels"
      : rankingTitle(sort, platform, game);

  const initialMeta = {
    total,
    page,
    limit: 32,
    totalPages: Math.ceil(total / 32),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <ItemListJsonLd creators={initialCreators} page={page} perPage={32} />
      <Suspense>
        <div className="mb-6">
          <CreatorPlatformPills />
        </div>
      </Suspense>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-[#F2F3F5]">{heading}</h1>
          <p className="mt-2 text-sm text-[#949BA4]">
            Browse creator profiles by platform, follow growth momentum, and
            sort the directory by scale or recent movement.
          </p>
        </div>
        <span className="text-sm text-[#949BA4]">
          {formatNumber(total)} channels
        </span>
      </div>

      <Suspense>
        <div className="mb-4 flex items-center gap-3">
          <CreatorViewToggle />
          <CreatorGameFilter games={topGames} activeGame={game} />
          <CreatorSortControls />
        </div>
      </Suspense>

      <Suspense>
        <CreatorGrid initialData={initialCreators} initialMeta={initialMeta} />
      </Suspense>
    </div>
  );
}
