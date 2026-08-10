import { Prisma } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { createLogger } from "@/lib/logger";
import { DISCOVERABLE_CREATOR_SQL } from "./creator-visibility";

const log = createLogger("trending");

/**
 * Growth beyond this percentage over 7 days is treated as a bad baseline, not
 * a real gain. A single corrupt snapshot (e.g. one 44,699 reading inside an
 * otherwise flat 538k series) becomes the 7-day comparison point and produces
 * a four-figure percentage on a creator who is actually flat — and because
 * trending ranks on absolute delta, those rows land at the very top. Real
 * creators above the totalFollowers floor do not gain half their audience in
 * a week, so this only ever removes artifacts.
 */
export const MAX_PLAUSIBLE_PCT_7D = 50;

export type TrendingCreator = {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  totalFollowers: string;
  delta7d: string;
  followerPct7d: number;
  trendDirection: string;
  primaryPlatform: string;
  platformAccounts: { platform: string; platformUsername: string }[];
};

type Row = {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  totalFollowers: bigint;
  primaryPlatform: string;
  delta7d: bigint;
  pct7d: number | null;
  trendDirection: string | null;
  platformAccounts: { platform: string; platformUsername: string }[];
};

/**
 * Returns trending creators ordered by absolute 7-day follower gain on their
 * primary platform — mirrors the `/api/creators?sort=trending` ranking so the
 * landing card matches what users see in the browse "Trending" filter.
 *
 * Floors: delta7d > 100 and totalFollowers > 500 to keep tiny-base outliers
 * out, plus the MAX_PLAUSIBLE_PCT_7D guard against corrupt baselines.
 *
 * Driven from CreatorGrowthRollup rather than CreatorProfile: only ~10% of
 * listed profiles have a rollup at all, so scanning profiles meant ~260k index
 * probes that found nothing (~970ms). Starting from the rollup side reaches
 * the same rows in ~13ms. The inner join is safe because
 * CreatorGrowthRollup is unique on (creatorProfileId, platform), and a
 * profile with no rollup could never clear the delta7d floor anyway.
 *
 * Platform accounts are aggregated after the LIMIT so the join only runs for
 * the handful of rows actually returned, not every ranked candidate.
 *
 * Deliberately DB-only: the sole caller is the ISR'd landing page, which
 * caches the whole render for 10 minutes. The Upstash client's no-store
 * fetch would opt the page out of static rendering, so no Redis here.
 */
export async function getTrendingCreators(
  limit = 9,
): Promise<TrendingCreator[]> {
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    WITH ranked AS (
      SELECT cp.id,
             cp.slug,
             cp."displayName",
             cp."avatarUrl",
             cp."totalFollowers",
             cp."primaryPlatform"::text AS "primaryPlatform",
             cgr."delta7d",
             cgr."pct7d",
             cgr."trendDirection"::text AS "trendDirection"
      FROM "CreatorGrowthRollup" cgr
      JOIN "CreatorProfile" cp
        ON cp.id = cgr."creatorProfileId"
       AND cgr.platform = cp."primaryPlatform"
      WHERE ${DISCOVERABLE_CREATOR_SQL}
        AND cp."totalFollowers" > 500
        AND cgr."delta7d" > 100
        AND (cgr."pct7d" IS NULL OR cgr."pct7d" <= ${MAX_PLAUSIBLE_PCT_7D})
      ORDER BY cgr."delta7d" DESC, cp."totalFollowers" DESC
      LIMIT ${limit}
    )
    SELECT ranked.*,
           COALESCE(acc."platformAccounts", '[]'::json) AS "platformAccounts"
    FROM ranked
    LEFT JOIN LATERAL (
      SELECT json_agg(
               json_build_object(
                 'platform', pa.platform::text,
                 'platformUsername', pa."platformUsername"
               )
               ORDER BY pa.platform::text
             ) AS "platformAccounts"
      FROM "PlatformAccount" pa
      WHERE pa."creatorProfileId" = ranked.id
    ) acc ON true
    ORDER BY ranked."delta7d" DESC, ranked."totalFollowers" DESC
  `);

  const trending: TrendingCreator[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    totalFollowers: r.totalFollowers.toString(),
    delta7d: r.delta7d.toString(),
    followerPct7d: r.pct7d ?? 0,
    trendDirection: r.trendDirection ?? "FLAT",
    primaryPlatform: r.primaryPlatform,
    platformAccounts: r.platformAccounts,
  }));

  log.info({ count: trending.length }, "Trending creators computed");
  return trending;
}
