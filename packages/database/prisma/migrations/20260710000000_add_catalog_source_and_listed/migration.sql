-- CreatorProfile catalog provenance + browse visibility.
-- catalogSource: where the profile was born ("streamhatchet" | "twitch_api" |
--   "youtube_api" | "user_claim"); drives enrichment precedence + backfill guards.
-- listed: public browse visibility gate (SH-born profiles ingested for everyone,
--   listed only after clearing the >=2 active-days/30d activity gate).
ALTER TABLE "CreatorProfile"
  ADD COLUMN "catalogSource" TEXT,
  ADD COLUMN "listed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "CreatorProfile_listed_totalFollowers_idx"
  ON "CreatorProfile" ("listed", "totalFollowers" DESC);

CREATE INDEX "CreatorProfile_catalogSource_idx"
  ON "CreatorProfile" ("catalogSource");

-- Existing profiles are all API-discovered or user-claimed and already visible;
-- keep them listed so this change is non-destructive to the current catalog.
UPDATE "CreatorProfile" SET "listed" = true;
UPDATE "CreatorProfile" SET "catalogSource" = 'user_claim' WHERE "userId" IS NOT NULL;
UPDATE "CreatorProfile" SET "catalogSource" = 'twitch_api' WHERE "catalogSource" IS NULL;
