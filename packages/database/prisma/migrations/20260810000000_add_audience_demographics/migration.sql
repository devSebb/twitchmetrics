-- CreateTable
CREATE TABLE "AudienceDemographics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creatorProfileId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'demographics_pro',
    "ages" JSONB,
    "genders" JSONB,
    "countries" JSONB,
    "income" JSONB,
    "ethnicities" JSONB,
    "reach" BIGINT,
    "reportId" TEXT,
    "dpUpdatedAt" TIMESTAMP(3),
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceDemographics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AudienceDemographics_creatorProfileId_platform_key" ON "AudienceDemographics"("creatorProfileId", "platform");

-- CreateIndex
CREATE INDEX "AudienceDemographics_platform_idx" ON "AudienceDemographics"("platform");

-- AddForeignKey
ALTER TABLE "AudienceDemographics" ADD CONSTRAINT "AudienceDemographics_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
