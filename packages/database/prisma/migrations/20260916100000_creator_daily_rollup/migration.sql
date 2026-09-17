-- Per-creator daily rollups: unique (merged) airtime across platforms.
--
-- Summing ChannelDailyRollup double-counts simulcasts — a 4 h stream on two
-- platforms reads as 8 h, and avgViewers (= watch time / airtime) comes out
-- halved. This table stores the merged wall-clock intervals per creator per
-- UTC day, so /creator stats and the creators list stop double-counting.
--
-- Written by the same rollup pass that writes the channel tables, in a step
-- that runs once per date AFTER every platform for that date (a creator's day
-- spans platforms). New table, so no backfill risk: it is populated by the
-- Phase C rollup recompute.

CREATE TABLE IF NOT EXISTS "CreatorDailyRollup" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "creatorProfileId" UUID NOT NULL,
  "date" DATE NOT NULL,
  "uniqueAirtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "minutesWatched" BIGINT NOT NULL DEFAULT 0,
  "streamBlocks" INTEGER NOT NULL DEFAULT 0,
  "platforms" "Platform"[] NOT NULL DEFAULT ARRAY[]::"Platform"[],
  "intervals" JSONB,
  "peakViewers" INTEGER,
  "peakPlatform" "Platform",
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreatorDailyRollup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreatorDailyRollup_creatorProfileId_date_key"
  ON "CreatorDailyRollup" ("creatorProfileId", "date");
CREATE INDEX IF NOT EXISTS "CreatorDailyRollup_date_idx"
  ON "CreatorDailyRollup" ("date");

ALTER TABLE "CreatorDailyRollup"
  ADD CONSTRAINT "CreatorDailyRollup_creatorProfileId_fkey"
  FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
