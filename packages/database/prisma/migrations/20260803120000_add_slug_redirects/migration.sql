-- Durable slug redirects: old slug -> canonical creator profile.
-- Written by the machine-slug cleanup (workers/reslug-hash-creators.ts) and any
-- future slug rename so old /creator/<slug> links 308 forever.

-- CreateTable
CREATE TABLE "SlugRedirect" (
    "oldSlug" TEXT NOT NULL,
    "creatorProfileId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlugRedirect_pkey" PRIMARY KEY ("oldSlug")
);

-- CreateIndex
CREATE INDEX "SlugRedirect_creatorProfileId_idx" ON "SlugRedirect"("creatorProfileId");

-- AddForeignKey
ALTER TABLE "SlugRedirect" ADD CONSTRAINT "SlugRedirect_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
