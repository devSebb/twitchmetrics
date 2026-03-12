import { NextResponse } from "next/server";
import { Prisma, Platform } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { buildMeta, parsePagination } from "@/app/api/_lib/pagination";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";

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

function buildWhereClause(platform: Platform | null, query: string | null) {
  const conditions: Prisma.Sql[] = [];

  if (platform) {
    conditions.push(Prisma.sql`cp."primaryPlatform" = ${platform}`);
  }

  if (query) {
    conditions.push(
      Prisma.sql`(cp."searchText" % ${query} OR cp."searchText" ILIKE '%' || ${query} || '%')`,
    );
  }

  if (!conditions.length) {
    return Prisma.sql``;
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

function getOrderClause(sort: string | null): Prisma.Sql {
  switch (sort) {
    case "trending":
      return Prisma.sql`
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
      `;
    case "recent":
      return Prisma.sql`ORDER BY cp."createdAt" DESC`;
    case "followers":
    default:
      return Prisma.sql`ORDER BY cp."totalFollowers" DESC`;
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

  const whereClause = buildWhereClause(platform, query);
  const orderClause = getOrderClause(sort);

  const [idRows, totalRows] = await Promise.all([
    db.$queryRaw<CreatorIdRow[]>(Prisma.sql`
      SELECT cp.id
      FROM "CreatorProfile" cp
      ${whereClause}
      ${orderClause}
      LIMIT ${limit}
      OFFSET ${skip}
    `),
    db.$queryRaw<TotalRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM "CreatorProfile" cp
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
    where: { id: { in: ids } },
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
      const growthRollup =
        creator.growthRollups.find(
          (rollup) => rollup.platform === creator.primaryPlatform,
        ) ??
        creator.growthRollups[0] ??
        null;

      return {
        id: creator.id,
        displayName: creator.displayName,
        slug: creator.slug,
        avatarUrl: creator.avatarUrl,
        primaryPlatform: creator.primaryPlatform,
        totalFollowers: creator.totalFollowers.toString(),
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

  return NextResponse.json(
    serializeBigInt({
      data,
      meta: buildMeta(total, page, limit),
    }),
  );
}
