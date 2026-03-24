-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "avgLiveChannels" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GameBroadcastLanguage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gameId" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameBroadcastLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTopChannel" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gameId" UUID NOT NULL,
    "channelName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "slug" TEXT,
    "category" TEXT NOT NULL,
    "avgViewers" INTEGER NOT NULL DEFAULT 0,
    "airtime" INTEGER NOT NULL DEFAULT 0,
    "viewerHours" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameTopChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameClip" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gameId" UUID NOT NULL,
    "clipId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameClip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameBroadcastLanguage_gameId_idx" ON "GameBroadcastLanguage"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameBroadcastLanguage_gameId_language_key" ON "GameBroadcastLanguage"("gameId", "language");

-- CreateIndex
CREATE INDEX "GameTopChannel_gameId_category_idx" ON "GameTopChannel"("gameId", "category");

-- CreateIndex
CREATE INDEX "GameClip_gameId_idx" ON "GameClip"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameClip_gameId_clipId_key" ON "GameClip"("gameId", "clipId");

-- AddForeignKey
ALTER TABLE "GameBroadcastLanguage" ADD CONSTRAINT "GameBroadcastLanguage_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTopChannel" ADD CONSTRAINT "GameTopChannel_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameClip" ADD CONSTRAINT "GameClip_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
