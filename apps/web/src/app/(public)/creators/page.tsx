import type { Metadata } from "next";
import { Suspense } from "react";
import { Platform, Prisma } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { formatNumber } from "@/lib/utils/format";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { CreatorFilters, CreatorGrid } from "@/components/creators";

export const revalidate = 300; // ISR: revalidate every 5 minutes

export const metadata: Metadata = {
  title: "Top Creators",
  description:
    "Browse the top creators across Twitch, YouTube, Instagram, TikTok, and more. Live follower counts and growth trends.",
  openGraph: {
    title: `Top Creators | ${SITE_NAME}`,
    description:
      "Browse the top creators across Twitch, YouTube, Instagram, TikTok, and more.",
    type: "website",
    url: `${SITE_URL}/creators`,
  },
  twitter: {
    card: "summary",
    site: TWITTER_HANDLE,
    title: `Top Creators | ${SITE_NAME}`,
  },
  alternates: { canonical: `${SITE_URL}/creators` },
};

type SortOption = "followers" | "trending" | "recent";
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
  return value === "trending" || value === "recent" ? value : "followers";
}

function parsePage(value?: string): number {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

async function getCreators({
  platform,
  sort,
  page,
}: {
  platform: Platform | undefined;
  sort: SortOption;
  page: number;
}) {
  const take = 20;
  const skip = (page - 1) * take;
  const whereClause = platform
    ? Prisma.sql`WHERE cp."primaryPlatform" = ${platform}`
    : Prisma.sql``;
  const orderClause =
    sort === "trending"
      ? Prisma.sql`
          ORDER BY COALESCE(
            (
              SELECT cgr."delta7d"
              FROM "CreatorGrowthRollup" cgr
              WHERE cgr."creatorProfileId" = cp.id
                AND cgr.platform = cp."primaryPlatform"
              LIMIT 1
            ),
            0
          ) DESC, cp."totalFollowers" DESC
        `
      : sort === "recent"
        ? Prisma.sql`ORDER BY cp."createdAt" DESC`
        : Prisma.sql`ORDER BY cp."totalFollowers" DESC`;

  const idRows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT cp.id
    FROM "CreatorProfile" cp
    ${whereClause}
    ${orderClause}
    LIMIT ${take}
    OFFSET ${skip}
  `);

  const ids = idRows.map((row) => row.id);
  const countWhere = platform ? { primaryPlatform: platform } : undefined;

  const [creators, countResult]: [CreatorRecord[], number] = await Promise.all([
    ids.length
      ? db.creatorProfile.findMany({
          where: { id: { in: ids } },
          include: {
            platformAccounts: true,
            growthRollups: {
              orderBy: { computedAt: "desc" },
            },
          },
        })
      : Promise.resolve([] as CreatorRecord[]),
    countWhere
      ? db.creatorProfile.count({ where: countWhere })
      : db.creatorProfile.count(),
  ]);

  const creatorById = new Map(creators.map((creator) => [creator.id, creator]));

  const data = ids
    .map((id) => creatorById.get(id))
    .filter((creator): creator is NonNullable<typeof creator> =>
      Boolean(creator),
    )
    .map((creator) => {
      const growthRollup =
        creator.growthRollups.find(
          (r) => r.platform === creator.primaryPlatform,
        ) ??
        creator.growthRollups[0] ??
        null;

      return {
        displayName: creator.displayName,
        slug: creator.slug,
        avatarUrl: creator.avatarUrl,
        totalFollowers: creator.totalFollowers.toString(),
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
  }>;
};

const PLATFORM_LABELS: Record<Platform, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  kick: "Kick",
};

const SORT_LABELS: Record<SortOption, string> = {
  followers: "Most followed",
  trending: "Trending this week",
  recent: "Newest additions",
};

export default async function CreatorsPage({ searchParams }: PageProps) {
  const {
    platform: platformParam,
    sort: sortParam,
    page: pageParam,
  } = await searchParams;
  const platform = parsePlatform(platformParam);
  const sort = parseSort(sortParam);
  const page = parsePage(pageParam);
  const { data: initialCreators, total } = await getCreators({
    platform,
    sort,
    page,
  });

  const initialMeta = {
    total,
    page,
    limit: 20,
    totalPages: Math.ceil(total / 20),
  };
  const activePlatformLabel = platform ? PLATFORM_LABELS[platform] : "All";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 rounded-2xl border border-[#3F4147] bg-[linear-gradient(135deg,rgba(227,44,25,0.18),rgba(30,31,34,0.96)_42%,rgba(49,51,56,0.96))] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center rounded-full border border-[#E32C19]/30 bg-[#E32C19]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF8A7A]">
              Channel Directory
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#F2F3F5]">
              Discover the channels setting the pace.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#B5BAC1]">
              Browse creator profiles by platform, spot growth momentum, and
              sort the directory by scale or recent movement without leaving the
              channels list.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#3F4147] bg-[#1E1F22]/85 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#949BA4]">
                Channels
              </div>
              <div className="mt-1 text-xl font-semibold text-[#F2F3F5]">
                {formatNumber(total)}
              </div>
            </div>
            <div className="rounded-xl border border-[#3F4147] bg-[#1E1F22]/85 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#949BA4]">
                Platform
              </div>
              <div className="mt-1 text-sm font-medium text-[#F2F3F5]">
                {activePlatformLabel}
              </div>
            </div>
            <div className="rounded-xl border border-[#3F4147] bg-[#1E1F22]/85 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#949BA4]">
                Focus
              </div>
              <div className="mt-1 text-sm font-medium text-[#F2F3F5]">
                {SORT_LABELS[sort]}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Suspense>
        <div className="mb-8">
          <CreatorFilters />
        </div>
        <CreatorGrid initialData={initialCreators} initialMeta={initialMeta} />
      </Suspense>
    </div>
  );
}
