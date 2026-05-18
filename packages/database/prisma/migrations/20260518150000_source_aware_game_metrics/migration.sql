-- Preserve parallel platform metric feeds instead of letting providers overwrite
-- each other in the same platform/time bucket.
DROP INDEX IF EXISTS "GamePlatformViewerSnapshot_gameId_platform_bucketStartedAt_key";

CREATE UNIQUE INDEX "GamePlatformViewerSnapshot_gameId_platform_source_bucketStartedAt_key"
ON "GamePlatformViewerSnapshot"("gameId", "platform", "source", "bucketStartedAt");

-- Track channel source/platform provenance so Twitch, Kick, YouTube, and
-- StreamHatchet rows can coexist without channel-name collisions.
ALTER TABLE "GameTopChannel"
ADD COLUMN "platform" "Platform" NOT NULL DEFAULT 'twitch',
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'api',
ADD COLUMN "platformUserId" TEXT,
ADD COLUMN "streamTitle" TEXT,
ADD COLUMN "language" TEXT,
ADD COLUMN "startedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "GameTopChannel_gameId_channelName_key";

CREATE UNIQUE INDEX "GameTopChannel_gameId_platform_source_channelName_key"
ON "GameTopChannel"("gameId", "platform", "source", "channelName");

CREATE INDEX "GameTopChannel_gameId_platform_category_idx"
ON "GameTopChannel"("gameId", "platform", "category");
