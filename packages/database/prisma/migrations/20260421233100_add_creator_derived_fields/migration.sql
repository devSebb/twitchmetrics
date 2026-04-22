-- AlterTable
ALTER TABLE "CreatorProfile"
    ADD COLUMN "derivedLanguage" TEXT,
    ADD COLUMN "primaryGameName" TEXT,
    ADD COLUMN "primaryGameSlug" TEXT,
    ADD COLUMN "lastStreamAt" TIMESTAMP(3),
    ADD COLUMN "isActiveLast30d" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "lastEnrichedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CreatorProfile_derivedLanguage_idx" ON "CreatorProfile"("derivedLanguage");

-- CreateIndex
CREATE INDEX "CreatorProfile_primaryGameSlug_idx" ON "CreatorProfile"("primaryGameSlug");

-- CreateIndex
CREATE INDEX "CreatorProfile_isActiveLast30d_totalFollowers_idx" ON "CreatorProfile"("isActiveLast30d", "totalFollowers" DESC);
