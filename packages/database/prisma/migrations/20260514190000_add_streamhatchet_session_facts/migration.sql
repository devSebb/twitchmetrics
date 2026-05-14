-- CreateTable
CREATE TABLE "StreamHatchetSourceObject" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "etag" TEXT,
    "size" BIGINT,
    "lastModified" TIMESTAMP(3),
    "dataset" TEXT NOT NULL DEFAULT 'daily_sessions_summary',
    "platform" TEXT,
    "partitionDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "rowCount" INTEGER,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "metadata" JSONB,
    "lastImportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamHatchetSourceObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamSessionFact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL DEFAULT 'streamhatchet',
    "sourceObjectId" UUID NOT NULL,
    "creatorProfileId" UUID,
    "platform" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "platformVideoId" TEXT,
    "platformUsername" TEXT NOT NULL,
    "platformDisplayName" TEXT,
    "platformLogoUrl" TEXT,
    "country" TEXT,
    "partitionDate" DATE NOT NULL,
    "streamBeginsAt" TIMESTAMP(3) NOT NULL,
    "streamEndsAt" TIMESTAMP(3) NOT NULL,
    "peakViewersAt" TIMESTAMP(3),
    "sessionTitle" TEXT,
    "primaryGameName" TEXT,
    "allGameNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "airtimeMinutes" INTEGER NOT NULL,
    "minutesWatched" BIGINT NOT NULL,
    "sessionViews" BIGINT,
    "averageViewers" DOUBLE PRECISION NOT NULL,
    "averageViewersGlobal" DOUBLE PRECISION,
    "peakViewers" INTEGER NOT NULL,
    "share" DOUBLE PRECISION,
    "shareCrossPlatform" DOUBLE PRECISION,
    "bestRank" INTEGER,
    "averageRank" DOUBLE PRECISION,
    "worstRank" INTEGER,
    "aggregation" TEXT NOT NULL DEFAULT 'basic',
    "rawData" JSONB,
    "contentLabel" JSONB,
    "rowHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamSessionFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelDailyRollup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL DEFAULT 'streamhatchet',
    "platform" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "creatorProfileId" UUID,
    "platformUserId" TEXT NOT NULL,
    "platformUsername" TEXT NOT NULL,
    "platformDisplayName" TEXT,
    "platformLogoUrl" TEXT,
    "country" TEXT,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "airtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "minutesWatched" BIGINT NOT NULL DEFAULT 0,
    "sessionViews" BIGINT,
    "averageViewers" DOUBLE PRECISION,
    "averageViewersGlobal" DOUBLE PRECISION,
    "peakViewers" INTEGER,
    "peakViewersAt" TIMESTAMP(3),
    "primaryGameName" TEXT,
    "gameNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bestRank" INTEGER,
    "averageRank" DOUBLE PRECISION,
    "worstRank" INTEGER,
    "lastStreamAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelDailyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameDailyRollup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL DEFAULT 'streamhatchet',
    "platform" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "gameName" TEXT NOT NULL,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "channelCount" INTEGER NOT NULL DEFAULT 0,
    "airtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "minutesWatched" BIGINT NOT NULL DEFAULT 0,
    "averageViewers" DOUBLE PRECISION,
    "peakViewers" INTEGER,
    "topChannelUserId" TEXT,
    "topChannelUsername" TEXT,
    "topChannelDisplayName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameDailyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelGameDailyRollup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL DEFAULT 'streamhatchet',
    "platform" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "creatorProfileId" UUID,
    "platformUserId" TEXT NOT NULL,
    "platformUsername" TEXT NOT NULL,
    "platformDisplayName" TEXT,
    "gameName" TEXT NOT NULL,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "airtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "minutesWatched" BIGINT NOT NULL DEFAULT 0,
    "averageViewers" DOUBLE PRECISION,
    "peakViewers" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelGameDailyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StreamHatchetSourceObject_bucket_key_key" ON "StreamHatchetSourceObject"("bucket", "key");

-- CreateIndex
CREATE INDEX "StreamHatchetSourceObject_platform_partitionDate_idx" ON "StreamHatchetSourceObject"("platform", "partitionDate");

-- CreateIndex
CREATE INDEX "StreamHatchetSourceObject_status_updatedAt_idx" ON "StreamHatchetSourceObject"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StreamSessionFact_source_platform_platformUserId_streamBeginsAt_streamEndsAt_key" ON "StreamSessionFact"("source", "platform", "platformUserId", "streamBeginsAt", "streamEndsAt");

-- CreateIndex
CREATE INDEX "StreamSessionFact_sourceObjectId_idx" ON "StreamSessionFact"("sourceObjectId");

-- CreateIndex
CREATE INDEX "StreamSessionFact_creatorProfileId_platform_partitionDate_idx" ON "StreamSessionFact"("creatorProfileId", "platform", "partitionDate");

-- CreateIndex
CREATE INDEX "StreamSessionFact_platform_partitionDate_idx" ON "StreamSessionFact"("platform", "partitionDate");

-- CreateIndex
CREATE INDEX "StreamSessionFact_platform_primaryGameName_partitionDate_idx" ON "StreamSessionFact"("platform", "primaryGameName", "partitionDate");

-- CreateIndex
CREATE INDEX "StreamSessionFact_platformUserId_platform_partitionDate_idx" ON "StreamSessionFact"("platformUserId", "platform", "partitionDate");

-- CreateIndex
CREATE INDEX "StreamSessionFact_rowHash_idx" ON "StreamSessionFact"("rowHash");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelDailyRollup_source_platform_date_platformUserId_key" ON "ChannelDailyRollup"("source", "platform", "date", "platformUserId");

-- CreateIndex
CREATE INDEX "ChannelDailyRollup_creatorProfileId_platform_date_idx" ON "ChannelDailyRollup"("creatorProfileId", "platform", "date");

-- CreateIndex
CREATE INDEX "ChannelDailyRollup_platform_date_minutesWatched_idx" ON "ChannelDailyRollup"("platform", "date", "minutesWatched" DESC);

-- CreateIndex
CREATE INDEX "ChannelDailyRollup_platform_date_peakViewers_idx" ON "ChannelDailyRollup"("platform", "date", "peakViewers" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "GameDailyRollup_source_platform_date_gameName_key" ON "GameDailyRollup"("source", "platform", "date", "gameName");

-- CreateIndex
CREATE INDEX "GameDailyRollup_platform_date_minutesWatched_idx" ON "GameDailyRollup"("platform", "date", "minutesWatched" DESC);

-- CreateIndex
CREATE INDEX "GameDailyRollup_platform_gameName_date_idx" ON "GameDailyRollup"("platform", "gameName", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelGameDailyRollup_source_platform_date_platformUserId_gameName_key" ON "ChannelGameDailyRollup"("source", "platform", "date", "platformUserId", "gameName");

-- CreateIndex
CREATE INDEX "ChannelGameDailyRollup_creatorProfileId_platform_date_idx" ON "ChannelGameDailyRollup"("creatorProfileId", "platform", "date");

-- CreateIndex
CREATE INDEX "ChannelGameDailyRollup_platform_date_gameName_minutesWatched_idx" ON "ChannelGameDailyRollup"("platform", "date", "gameName", "minutesWatched" DESC);

-- AddForeignKey
ALTER TABLE "StreamSessionFact" ADD CONSTRAINT "StreamSessionFact_sourceObjectId_fkey" FOREIGN KEY ("sourceObjectId") REFERENCES "StreamHatchetSourceObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamSessionFact" ADD CONSTRAINT "StreamSessionFact_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
