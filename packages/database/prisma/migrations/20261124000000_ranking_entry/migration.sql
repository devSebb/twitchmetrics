-- Published rankings (/rankings): one row per place per ranking per window.
--
-- Written once a day by workers/build-rankings.ts, after the daily rollups.
-- Ranking creators over a 30-day window at request time groups millions of
-- CreatorDailyRollup rows (~19 s measured 2026-11-24), and no table kept last
-- period's places, so rank movement had nothing to compare against.
--
-- New table only: nothing existing is altered, and nothing reads it until the
-- worker has run with --write.

CREATE TABLE IF NOT EXISTS "RankingEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "gameSlug" TEXT NOT NULL DEFAULT '',
  "windowEnd" DATE NOT NULL,
  "windowDays" INTEGER NOT NULL,
  "rank" INTEGER NOT NULL,
  "creatorProfileId" UUID,
  "gameId" UUID,
  "value" DOUBLE PRECISION NOT NULL,
  "previousRank" INTEGER,
  "previousValue" DOUBLE PRECISION,
  "hasPrevious" BOOLEAN NOT NULL DEFAULT false,
  "stats" JSONB NOT NULL DEFAULT '{}',
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RankingEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RankingEntry_kind_scope_metric_gameSlug_windowDays_windowEnd_rank_key"
  ON "RankingEntry" ("kind", "scope", "metric", "gameSlug", "windowDays", "windowEnd", "rank");
CREATE INDEX IF NOT EXISTS "RankingEntry_creatorProfileId_idx"
  ON "RankingEntry" ("creatorProfileId");
CREATE INDEX IF NOT EXISTS "RankingEntry_gameId_idx"
  ON "RankingEntry" ("gameId");

ALTER TABLE "RankingEntry"
  ADD CONSTRAINT "RankingEntry_creatorProfileId_fkey"
  FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RankingEntry"
  ADD CONSTRAINT "RankingEntry_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "Game"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
