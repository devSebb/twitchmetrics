import { NextResponse } from "next/server";
import { Prisma, Platform } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { buildMeta, parsePagination } from "@/app/api/_lib/pagination";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";
import { cacheGet, cacheSet, CACHE_TTL } from "@/server/services/cache";
import {
  getStreamingStatsBatch,
  emptyStreamingStats,
} from "@/server/services/creator-streaming-stats";
import {
  DISCOVERABLE_CREATOR_SQL,
  DISCOVERABLE_CREATOR_WHERE,
} from "@/server/services/creator-visibility";
import { isKnownGrowthRollup } from "@/server/services/creator-growth";

const VALID_PLATFORMS = new Set<Platform>([
  "twitch",
  "youtube",
  "instagram",
  "tiktok",
  "x",
  "kick",
]);

type CreatorIdRow = { id: string };
type TotalRow = { total: bigint };

function parsePlatform(value: string | null): Platform | null {
  if (!value) return null;
  if (!VALID_PLATFORMS.has(value as Platform)) return null;
  return value as Platform;
}

// Platform filtering joins PlatformAccount (unique on creatorProfileId +
// platform, so no row fanout) so ranking can use that platform's own count
// instead of the cross-platform total.
function buildPlatformJoin(platform: Platform | null): Prisma.Sql {
  if (!platform) return Prisma.empty;
  return Prisma.sql`
    JOIN "PlatformAccount" pa
      ON pa."creatorProfileId" = cp.id
     AND pa.platform = ${platform}::"Platform"
  `;
}

function buildWhereClause(query: string | null) {
  const conditions: Prisma.Sql[] = [DISCOVERABLE_CREATOR_SQL];

  if (query) {
    conditions.push(
      Prisma.sql`(cp."searchText" % ${query} OR cp."searchText" ILIKE '%' || ${query} || '%')`,
    );
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

function getOrderClause(
  sort: string | null,
  platform: Platform | null,
): Prisma.Sql {
  // YouTube stores audience size in subscriberCount, others in followerCount.
  const platformFollowersSql = Prisma.sql`COALESCE(pa."followerCount", pa."subscriberCount")`;
  switch (sort) {
    case "trending":
      return Prisma.sql`
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
      `;
    case "recent":
      return Prisma.sql`ORDER BY cp."createdAt" DESC`;
    case "followers":
    default:
      return platform
        ? Prisma.sql`ORDER BY ${platformFollowersSql} DESC NULLS LAST, cp."totalFollowers" DESC`
        : Prisma.sql`ORDER BY cp."totalFollowers" DESC`;
  }
}

export async function GET(request: Request) {
  const rateLimited = await rateLimitOrResponse(request, "creators", {
    limit: 120,
    window: "60 s",
  });
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams);
  const query = searchParams.get("q")?.trim() || null;
  const platform = parsePlatform(searchParams.get("platform"));
  const sort = searchParams.get("sort");
  const view = searchParams.get("view") === "list" ? "list" : "grid";

  // Cache by normalized query params (view splits list/grid into separate keys
  // since list responses carry extra streaming-stat fields).
  const cacheKey = `creators:list:v5:p${page}:l${limit}:s${sort ?? "followers"}:q${query ?? ""}:pl${platform ?? ""}:v${view}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const joinClause = buildPlatformJoin(platform);
  const whereClause = buildWhereClause(query);
  const orderClause = getOrderClause(sort, platform);

  const [idRows, totalRows] = await Promise.all([
    db.$queryRaw<CreatorIdRow[]>(Prisma.sql`
      SELECT cp.id
      FROM "CreatorProfile" cp
      ${joinClause}
      ${whereClause}
      ${orderClause}
      LIMIT ${limit}
      OFFSET ${skip}
    `),
    db.$queryRaw<TotalRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM "CreatorProfile" cp
      ${joinClause}
      ${whereClause}
    `),
  ]);

  const ids = idRows.map((row) => row.id);
  const total = Number(totalRows[0]?.total ?? 0n);

  if (!ids.length) {
    return NextResponse.json({
      data: [],
      meta: buildMeta(total, page, limit),
    });
  }

  const creators = await db.creatorProfile.findMany({
    where: { ...DISCOVERABLE_CREATOR_WHERE, id: { in: ids } },
    select: {
      id: true,
      displayName: true,
      slug: true,
      avatarUrl: true,
      primaryPlatform: true,
      totalFollowers: true,
      state: true,
      snapshotTier: true,
      platformAccounts: {
        select: {
          platform: true,
          platformUsername: true,
          followerCount: true,
          subscriberCount: true,
        },
      },
      growthRollups: {
        orderBy: { computedAt: "desc" },
        select: {
          platform: true,
          delta7d: true,
          pct7d: true,
          trendDirection: true,
        },
      },
    },
  });

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
        ? (creator.growthRollups.find(
            (rollup) => rollup.platform === platform,
          ) ?? null)
        : (creator.growthRollups.find(
            (rollup) => rollup.platform === creator.primaryPlatform,
          ) ??
          creator.growthRollups[0] ??
          null);
      // Null delta7d means "no comparison snapshot" — treat as no rollup so
      // the UI renders missing data instead of a fake flat 0 trend.
      const growthRollup =
        rollupRow && isKnownGrowthRollup(rollupRow) ? rollupRow : null;

      const platformAccount = platform
        ? creator.platformAccounts.find(
            (account) => account.platform === platform,
          )
        : undefined;
      const displayFollowers = platformAccount
        ? (platformAccount.followerCount ??
          platformAccount.subscriberCount ??
          0n)
        : creator.totalFollowers;

      return {
        id: creator.id,
        displayName: creator.displayName,
        slug: creator.slug,
        avatarUrl: creator.avatarUrl,
        primaryPlatform: creator.primaryPlatform,
        totalFollowers: creator.totalFollowers.toString(),
        displayFollowers: displayFollowers.toString(),
        state: creator.state,
        snapshotTier: creator.snapshotTier,
        platformAccounts: creator.platformAccounts.map((account) => ({
          platform: account.platform,
          platformUsername: account.platformUsername,
          followerCount: account.followerCount?.toString() ?? "0",
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

  if (view === "list") {
    const statsById = await getStreamingStatsBatch(ids);
    for (const row of data) {
      const stats = statsById.get(row.id) ?? emptyStreamingStats();
      Object.assign(row, stats);
    }
  }

  const response = serializeBigInt({
    data,
    meta: buildMeta(total, page, limit),
  });

  await cacheSet(cacheKey, response, CACHE_TTL.CREATOR_LIST);
  return NextResponse.json(response);
}
