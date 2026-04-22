-- CreateTable
CREATE TABLE "CreatorClip" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creatorProfileId" UUID NOT NULL,
    "clipId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "duration" DOUBLE PRECISION,
    "gameName" TEXT,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorClip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorClip_creatorProfileId_clipId_key" ON "CreatorClip"("creatorProfileId", "clipId");

-- CreateIndex
CREATE INDEX "CreatorClip_creatorProfileId_createdAt_idx" ON "CreatorClip"("creatorProfileId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CreatorClip_creatorProfileId_viewCount_idx" ON "CreatorClip"("creatorProfileId", "viewCount" DESC);

-- AddForeignKey
ALTER TABLE "CreatorClip" ADD CONSTRAINT "CreatorClip_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
