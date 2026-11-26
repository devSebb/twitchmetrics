-- Stream Hatchet's own daily aggregates (channels/*/profile_game/day and
-- games/*/viewership), imported by workers/streamhatchet-profile-game.ts.
--
-- New tables only: nothing existing is altered and nothing on the site reads
-- them yet. They are separate from the *DailyRollup tables because several
-- readers of those do not filter on "source"; rows added there would be
-- counted twice.

CREATE TABLE IF NOT EXISTS "ShChannelGameDaily" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "platform" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "creatorProfileId" UUID,
  "platformUserId" TEXT NOT NULL,
  "displayName" TEXT,
  "gameName" TEXT NOT NULL DEFAULT '',
  "shGameId" TEXT,
  "airtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "minutesWatched" BIGINT NOT NULL DEFAULT 0,
  "averageViewers" DOUBLE PRECISION,
  "peakViewers" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShChannelGameDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShChannelGameDaily_platform_date_platformUserId_gameName_key"
  ON "ShChannelGameDaily" ("platform", "date", "platformUserId", "gameName");
CREATE INDEX IF NOT EXISTS "ShChannelGameDaily_creatorProfileId_date_idx"
  ON "ShChannelGameDaily" ("creatorProfileId", "date");
CREATE INDEX IF NOT EXISTS "ShChannelGameDaily_platform_date_gameName_minutesWatched_idx"
  ON "ShChannelGameDaily" ("platform", "date", "gameName", "minutesWatched" DESC);

CREATE TABLE IF NOT EXISTS "ShChannelDaily" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "platform" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "creatorProfileId" UUID,
  "platformUserId" TEXT NOT NULL,
  "username" TEXT,
  "displayName" TEXT,
  "logoUrl" TEXT,
  "airtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "minutesWatched" BIGINT NOT NULL DEFAULT 0,
  "averageViewers" DOUBLE PRECISION,
  "peakViewers" INTEGER,
  "peakViewersAt" TIMESTAMP(3),
  "followers" BIGINT,
  "primaryGameName" TEXT,
  "gameNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "intervals" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShChannelDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShChannelDaily_platform_date_platformUserId_key"
  ON "ShChannelDaily" ("platform", "date", "platformUserId");
CREATE INDEX IF NOT EXISTS "ShChannelDaily_creatorProfileId_date_idx"
  ON "ShChannelDaily" ("creatorProfileId", "date");
CREATE INDEX IF NOT EXISTS "ShChannelDaily_platform_date_minutesWatched_idx"
  ON "ShChannelDaily" ("platform", "date", "minutesWatched" DESC);
CREATE INDEX IF NOT EXISTS "ShChannelDaily_platform_date_peakViewers_idx"
  ON "ShChannelDaily" ("platform", "date", "peakViewers" DESC);

CREATE TABLE IF NOT EXISTS "ShGameDaily" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "platform" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "gameName" TEXT NOT NULL DEFAULT '',
  "shGameId" TEXT,
  "minutesWatched" BIGINT NOT NULL DEFAULT 0,
  "minutesLive" INTEGER NOT NULL DEFAULT 0,
  "peakViewers" INTEGER,
  "peakViewersAt" TIMESTAMP(3),
  "airtimeMinutes" BIGINT NOT NULL DEFAULT 0,
  "peakChannels" INTEGER,
  "channelCount" INTEGER,
  "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShGameDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShGameDaily_platform_date_gameName_key"
  ON "ShGameDaily" ("platform", "date", "gameName");
CREATE INDEX IF NOT EXISTS "ShGameDaily_platform_date_minutesWatched_idx"
  ON "ShGameDaily" ("platform", "date", "minutesWatched" DESC);
CREATE INDEX IF NOT EXISTS "ShGameDaily_platform_gameName_date_idx"
  ON "ShGameDaily" ("platform", "gameName", "date");

CREATE TABLE IF NOT EXISTS "ShGameMinuteSeries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "platform" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "gameName" TEXT NOT NULL DEFAULT '',
  "startMinute" INTEGER NOT NULL,
  "viewers" INTEGER[],
  "channels" INTEGER[],
  CONSTRAINT "ShGameMinuteSeries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShGameMinuteSeries_platform_date_gameName_key"
  ON "ShGameMinuteSeries" ("platform", "date", "gameName");
CREATE INDEX IF NOT EXISTS "ShGameMinuteSeries_platform_gameName_date_idx"
  ON "ShGameMinuteSeries" ("platform", "gameName", "date");
