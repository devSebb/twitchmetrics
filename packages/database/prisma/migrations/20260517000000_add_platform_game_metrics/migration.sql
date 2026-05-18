-- CreateTable
CREATE TABLE "PlatformGameMapping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gameId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformGameId" TEXT NOT NULL,
    "platformGameName" TEXT NOT NULL,
    "platformSlug" TEXT,
    "thumbnailUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'api',
    "confidence" TEXT NOT NULL DEFAULT 'exact_name',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformGameMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePlatformViewerSnapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gameId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformGameId" TEXT,
    "platformGameName" TEXT,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bucketStartedAt" TIMESTAMP(3) NOT NULL,
    "viewers" INTEGER NOT NULL,
    "channels" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'api',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePlatformViewerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformGameMapping_platform_platformGameId_key" ON "PlatformGameMapping"("platform", "platformGameId");

-- CreateIndex
CREATE INDEX "PlatformGameMapping_gameId_platform_idx" ON "PlatformGameMapping"("gameId", "platform");

-- CreateIndex
CREATE INDEX "PlatformGameMapping_platform_platformGameName_idx" ON "PlatformGameMapping"("platform", "platformGameName");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlatformViewerSnapshot_gameId_platform_bucketStartedAt_key" ON "GamePlatformViewerSnapshot"("gameId", "platform", "bucketStartedAt");

-- CreateIndex
CREATE INDEX "GamePlatformViewerSnapshot_gameId_bucketStartedAt_idx" ON "GamePlatformViewerSnapshot"("gameId", "bucketStartedAt");

-- CreateIndex
CREATE INDEX "GamePlatformViewerSnapshot_platform_bucketStartedAt_idx" ON "GamePlatformViewerSnapshot"("platform", "bucketStartedAt");

-- CreateIndex
CREATE INDEX "GamePlatformViewerSnapshot_platform_platformGameId_idx" ON "GamePlatformViewerSnapshot"("platform", "platformGameId");

-- AddForeignKey
ALTER TABLE "PlatformGameMapping" ADD CONSTRAINT "PlatformGameMapping_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlatformViewerSnapshot" ADD CONSTRAINT "GamePlatformViewerSnapshot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
