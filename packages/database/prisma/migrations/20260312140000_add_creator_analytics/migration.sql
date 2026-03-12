-- CreateTable
CREATE TABLE "CreatorAnalytics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "creatorProfileId" UUID NOT NULL,
  "platform" "Platform" NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "estimatedMinutesWatched" BIGINT,
  "averageViewDuration" DOUBLE PRECISION,
  "subscribersGained" INTEGER,
  "subscribersLost" INTEGER,
  "estimatedRevenue" DOUBLE PRECISION,
  "views" BIGINT,
  "likes" INTEGER,
  "comments" INTEGER,
  "shares" INTEGER,
  "impressions" BIGINT,
  "reach" BIGINT,
  "profileViews" INTEGER,
  "websiteClicks" INTEGER,
  "subscriberCount" INTEGER,
  "subscriberPoints" INTEGER,
  "ageGenderData" JSONB,
  "countryData" JSONB,
  "deviceData" JSONB,
  "trafficSources" JSONB,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CreatorAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorAnalytics_creatorProfileId_platform_periodStart_key"
ON "CreatorAnalytics"("creatorProfileId", "platform", "periodStart");

-- CreateIndex
CREATE INDEX "CreatorAnalytics_creatorProfileId_platform_idx"
ON "CreatorAnalytics"("creatorProfileId", "platform");

-- CreateIndex
CREATE INDEX "CreatorAnalytics_periodStart_idx"
ON "CreatorAnalytics"("periodStart");

-- AddForeignKey
ALTER TABLE "CreatorAnalytics"
ADD CONSTRAINT "CreatorAnalytics_creatorProfileId_fkey"
FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
