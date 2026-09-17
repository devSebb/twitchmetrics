import { Prisma, type PrismaClient } from "@twitchmetrics/database";

/**
 * Insert-or-merge StreamSessionFact rows.
 *
 * Every SH daily export carries a rolling 3-day window, so one long stream
 * appears in several files. Measured 2026-09-16 over 3,000 duplicated yt
 * streams: 2,956 had a LATER begin in the newest file (the window slides, it
 * does not nest), each sighting is capped at the window (max 4,319 min) and
 * the true streams run a median 37,439 min (~26 days) — 24/7 channels. The old
 * key included (streamBeginsAt, streamEndsAt), so each slid copy inserted a new
 * row: +199 % yt airtime, +109 % yt watch time.
 *
 * Identity (must match the unique index exactly):
 *
 *   (source, platform, platformUserId,
 *    COALESCE(platformVideoId, ''),
 *    COALESCE(CASE WHEN platformVideoId IS NULL THEN streamBeginsAt END,
 *             TIMESTAMP '1970-01-01'))
 *
 * Platforms with a video id key on it alone; Kick (no video id) keys on its
 * begin time, which was verified not to slide (102 overlapping pairs in
 * 104,751 rows over 7 days). The sentinel keeps every key column NOT NULL —
 * Postgres treats NULLs in a unique index as distinct, so a `CASE … END` that
 * evaluates to NULL for video-id rows would never conflict at all.
 *
 * Merge rule (decision D10, "option A"):
 *   begins  = LEAST, ends = GREATEST
 *   airtime = the merged span, because no single sighting covers the stream
 *   avgViewers = airtime-weighted mean of what has been seen
 *   watch time = avgViewers × airtime (there is no raw total to keep)
 *   peak = GREATEST, with the timestamp of whichever side won
 * Descriptive columns take the newest sighting.
 */

export type StreamFactInput = Prisma.StreamSessionFactCreateManyInput;

export type UpsertFactsResult = { inserted: number; updated: number };

const UPSERT_BATCH = 500;

/** Column order shared by the VALUES tuples and the INSERT column list. */
const COLUMNS = [
  "source",
  "sourceObjectId",
  "creatorProfileId",
  "platform",
  "platformUserId",
  "platformVideoId",
  "platformUsername",
  "platformDisplayName",
  "platformLogoUrl",
  "country",
  "partitionDate",
  "streamBeginsAt",
  "streamEndsAt",
  "peakViewersAt",
  "sessionTitle",
  "primaryGameName",
  "allGameNames",
  "airtimeMinutes",
  "minutesWatched",
  "sessionViews",
  "averageViewers",
  "averageViewersGlobal",
  "peakViewers",
  "share",
  "shareCrossPlatform",
  "bestRank",
  "averageRank",
  "worstRank",
  "aggregation",
  "rawData",
  "contentLabel",
  "rowHash",
] as const;

function jsonParam(value: unknown): Prisma.Sql {
  return value === null || value === undefined
    ? Prisma.sql`NULL::jsonb`
    : Prisma.sql`${JSON.stringify(value)}::jsonb`;
}

function valuesTuple(fact: StreamFactInput): Prisma.Sql {
  const raw = fact as Record<string, unknown>;
  return Prisma.sql`(
    ${raw.source ?? "streamhatchet"},
    ${raw.sourceObjectId}::uuid,
    ${raw.creatorProfileId ?? null}::uuid,
    ${raw.platform},
    ${raw.platformUserId},
    ${raw.platformVideoId ?? null},
    ${raw.platformUsername},
    ${raw.platformDisplayName ?? null},
    ${raw.platformLogoUrl ?? null},
    ${raw.country ?? null},
    ${raw.partitionDate}::date,
    ${raw.streamBeginsAt}::timestamp,
    ${raw.streamEndsAt}::timestamp,
    ${raw.peakViewersAt ?? null}::timestamp,
    ${raw.sessionTitle ?? null},
    ${raw.primaryGameName ?? null},
    ${(raw.allGameNames as string[] | undefined) ?? []}::text[],
    ${raw.airtimeMinutes}::int,
    ${raw.minutesWatched}::bigint,
    ${raw.sessionViews ?? null}::bigint,
    ${raw.averageViewers}::double precision,
    ${raw.averageViewersGlobal ?? null}::double precision,
    ${raw.peakViewers}::int,
    ${raw.share ?? null}::double precision,
    ${raw.shareCrossPlatform ?? null}::double precision,
    ${raw.bestRank ?? null}::int,
    ${raw.averageRank ?? null}::double precision,
    ${raw.worstRank ?? null}::int,
    ${raw.aggregation ?? "basic"},
    ${jsonParam(raw.rawData)},
    ${jsonParam(raw.contentLabel)},
    ${raw.rowHash}
  )`;
}

export async function upsertStreamSessionFacts(
  db: Pick<PrismaClient, "$queryRaw">,
  facts: StreamFactInput[],
): Promise<UpsertFactsResult> {
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < facts.length; i += UPSERT_BATCH) {
    const batch = facts.slice(i, i + UPSERT_BATCH);
    if (batch.length === 0) continue;

    const columnList = Prisma.raw(COLUMNS.map((c) => `"${c}"`).join(", "));
    const values = Prisma.join(batch.map(valuesTuple));

    const rows = await db.$queryRaw<{ inserted: boolean }[]>(Prisma.sql`
      INSERT INTO "StreamSessionFact" (${columnList})
      VALUES ${values}
      ON CONFLICT (source, platform, "platformUserId",
                   (COALESCE("platformVideoId", '')),
                   (COALESCE(CASE WHEN "platformVideoId" IS NULL
                                  THEN "streamBeginsAt" END,
                             TIMESTAMP '1970-01-01')))
      DO UPDATE SET
        "streamBeginsAt" = LEAST("StreamSessionFact"."streamBeginsAt", EXCLUDED."streamBeginsAt"),
        "streamEndsAt"   = GREATEST("StreamSessionFact"."streamEndsAt", EXCLUDED."streamEndsAt"),
        -- Span of the merged interval: no sighting covers a multi-day stream.
        "airtimeMinutes" = GREATEST(
          1,
          ROUND(EXTRACT(EPOCH FROM (
            GREATEST("StreamSessionFact"."streamEndsAt", EXCLUDED."streamEndsAt")
            - LEAST("StreamSessionFact"."streamBeginsAt", EXCLUDED."streamBeginsAt")
          )) / 60)::int
        ),
        -- Airtime-weighted mean of what each side represents.
        "averageViewers" = CASE
          WHEN ("StreamSessionFact"."airtimeMinutes" + EXCLUDED."airtimeMinutes") > 0
          THEN ("StreamSessionFact"."averageViewers" * "StreamSessionFact"."airtimeMinutes"
                + EXCLUDED."averageViewers" * EXCLUDED."airtimeMinutes")
               / ("StreamSessionFact"."airtimeMinutes" + EXCLUDED."airtimeMinutes")
          ELSE GREATEST("StreamSessionFact"."averageViewers", EXCLUDED."averageViewers")
        END,
        "averageViewersGlobal" = COALESCE(EXCLUDED."averageViewersGlobal", "StreamSessionFact"."averageViewersGlobal"),
        -- Implied by the two above; recomputed after them from the new values.
        "minutesWatched" = ROUND(
          (CASE
            WHEN ("StreamSessionFact"."airtimeMinutes" + EXCLUDED."airtimeMinutes") > 0
            THEN ("StreamSessionFact"."averageViewers" * "StreamSessionFact"."airtimeMinutes"
                  + EXCLUDED."averageViewers" * EXCLUDED."airtimeMinutes")
                 / ("StreamSessionFact"."airtimeMinutes" + EXCLUDED."airtimeMinutes")
            ELSE GREATEST("StreamSessionFact"."averageViewers", EXCLUDED."averageViewers")
          END)
          * GREATEST(
            1,
            ROUND(EXTRACT(EPOCH FROM (
              GREATEST("StreamSessionFact"."streamEndsAt", EXCLUDED."streamEndsAt")
              - LEAST("StreamSessionFact"."streamBeginsAt", EXCLUDED."streamBeginsAt")
            )) / 60)::int
          )
        )::bigint,
        "sessionViews" = GREATEST(COALESCE("StreamSessionFact"."sessionViews", 0), COALESCE(EXCLUDED."sessionViews", 0)),
        "peakViewers" = GREATEST("StreamSessionFact"."peakViewers", EXCLUDED."peakViewers"),
        "peakViewersAt" = CASE
          WHEN EXCLUDED."peakViewers" > "StreamSessionFact"."peakViewers"
          THEN EXCLUDED."peakViewersAt" ELSE "StreamSessionFact"."peakViewersAt"
        END,
        -- Descriptive columns: newest sighting wins.
        "sourceObjectId" = EXCLUDED."sourceObjectId",
        "creatorProfileId" = COALESCE(EXCLUDED."creatorProfileId", "StreamSessionFact"."creatorProfileId"),
        "partitionDate" = EXCLUDED."partitionDate",
        "platformUsername" = EXCLUDED."platformUsername",
        "platformDisplayName" = EXCLUDED."platformDisplayName",
        "platformLogoUrl" = EXCLUDED."platformLogoUrl",
        "country" = EXCLUDED."country",
        "sessionTitle" = EXCLUDED."sessionTitle",
        "primaryGameName" = COALESCE(EXCLUDED."primaryGameName", "StreamSessionFact"."primaryGameName"),
        "allGameNames" = (
          SELECT COALESCE(array_agg(DISTINCT game), ARRAY[]::text[])
          FROM unnest("StreamSessionFact"."allGameNames" || EXCLUDED."allGameNames") AS game
        ),
        "share" = EXCLUDED."share",
        "shareCrossPlatform" = EXCLUDED."shareCrossPlatform",
        "bestRank" = LEAST(COALESCE("StreamSessionFact"."bestRank", EXCLUDED."bestRank"), COALESCE(EXCLUDED."bestRank", "StreamSessionFact"."bestRank")),
        "averageRank" = COALESCE(EXCLUDED."averageRank", "StreamSessionFact"."averageRank"),
        "worstRank" = GREATEST(COALESCE("StreamSessionFact"."worstRank", EXCLUDED."worstRank"), COALESCE(EXCLUDED."worstRank", "StreamSessionFact"."worstRank")),
        "rawData" = EXCLUDED."rawData",
        "contentLabel" = EXCLUDED."contentLabel",
        "rowHash" = EXCLUDED."rowHash",
        "updatedAt" = now()
      RETURNING (xmax = 0) AS inserted
    `);

    for (const row of rows) {
      if (row.inserted) inserted++;
      else updated++;
    }
  }

  return { inserted, updated };
}
