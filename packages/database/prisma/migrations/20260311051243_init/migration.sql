-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('creator', 'talent_manager', 'brand', 'admin');

-- CreateEnum
CREATE TYPE "ProfileState" AS ENUM ('unclaimed', 'pending_claim', 'claimed', 'premium');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('twitch', 'youtube', 'instagram', 'tiktok', 'x', 'kick');

-- CreateEnum
CREATE TYPE "SnapshotTier" AS ENUM ('tier1', 'tier2', 'tier3');

-- CreateEnum
CREATE TYPE "ClaimMethod" AS ENUM ('oauth', 'cross_platform', 'bio_challenge', 'post_challenge', 'manual_review');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'creator',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionToken" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "CreatorProfile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "state" "ProfileState" NOT NULL DEFAULT 'unclaimed',
    "snapshotTier" "SnapshotTier" NOT NULL DEFAULT 'tier3',
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "bio" TEXT,
    "country" TEXT,
    "primaryPlatform" "Platform" NOT NULL,
    "totalFollowers" BIGINT NOT NULL DEFAULT 0,
    "totalViews" BIGINT NOT NULL DEFAULT 0,
    "searchText" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSnapshotAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creatorProfileId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "platformUsername" TEXT NOT NULL,
    "platformDisplayName" TEXT,
    "platformUrl" TEXT,
    "platformAvatarUrl" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "oauthScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isOAuthConnected" BOOLEAN NOT NULL DEFAULT false,
    "lastOAuthRefresh" TIMESTAMP(3),
    "followerCount" BIGINT,
    "followingCount" BIGINT,
    "totalViews" BIGINT,
    "subscriberCount" BIGINT,
    "postCount" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creatorProfileId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followerCount" BIGINT,
    "followingCount" BIGINT,
    "totalViews" BIGINT,
    "subscriberCount" BIGINT,
    "postCount" INTEGER,
    "extendedMetrics" JSONB,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creatorProfileId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "method" "ClaimMethod" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'pending',
    "platform" "Platform" NOT NULL,
    "challengeCode" TEXT,
    "challengeExpiresAt" TIMESTAMP(3),
    "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewNotes" TEXT,
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ClaimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentManagerAccess" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "managerId" UUID NOT NULL,
    "creatorProfileId" UUID NOT NULL,
    "canViewAnalytics" BOOLEAN NOT NULL DEFAULT true,
    "canEditProfile" BOOLEAN NOT NULL DEFAULT false,
    "canExportData" BOOLEAN NOT NULL DEFAULT false,
    "canManageBrands" BOOLEAN NOT NULL DEFAULT false,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" UUID NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TalentManagerAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandPartnership" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creatorProfileId" UUID NOT NULL,
    "brandName" TEXT NOT NULL,
    "brandLogoUrl" TEXT,
    "campaignName" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandPartnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "twitchGameId" TEXT,
    "igdbId" INTEGER,
    "youtubeGameId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "summary" TEXT,
    "releaseDate" TIMESTAMP(3),
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "developer" TEXT,
    "publisher" TEXT,
    "searchText" TEXT DEFAULT '',
    "currentViewers" INTEGER NOT NULL DEFAULT 0,
    "currentChannels" INTEGER NOT NULL DEFAULT 0,
    "peakViewers24h" INTEGER NOT NULL DEFAULT 0,
    "avgViewers7d" INTEGER NOT NULL DEFAULT 0,
    "hoursWatched7d" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameViewerSnapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gameId" UUID NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "twitchViewers" INTEGER NOT NULL DEFAULT 0,
    "twitchChannels" INTEGER NOT NULL DEFAULT 0,
    "youtubeViewers" INTEGER NOT NULL DEFAULT 0,
    "youtubeChannels" INTEGER NOT NULL DEFAULT 0,
    "kickViewers" INTEGER NOT NULL DEFAULT 0,
    "kickChannels" INTEGER NOT NULL DEFAULT 0,
    "totalViewers" INTEGER NOT NULL DEFAULT 0,
    "totalChannels" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GameViewerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorGrowthRollup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creatorProfileId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "followerCount" BIGINT NOT NULL DEFAULT 0,
    "delta1d" BIGINT NOT NULL DEFAULT 0,
    "delta7d" BIGINT NOT NULL DEFAULT 0,
    "delta30d" BIGINT NOT NULL DEFAULT 0,
    "pct1d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pct7d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pct30d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trendDirection" TEXT NOT NULL DEFAULT 'FLAT',
    "acceleration" TEXT NOT NULL DEFAULT 'STABLE',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorGrowthRollup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_userId_key" ON "CreatorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_slug_key" ON "CreatorProfile"("slug");

-- CreateIndex
CREATE INDEX "CreatorProfile_state_idx" ON "CreatorProfile"("state");

-- CreateIndex
CREATE INDEX "CreatorProfile_snapshotTier_idx" ON "CreatorProfile"("snapshotTier");

-- CreateIndex
CREATE INDEX "CreatorProfile_primaryPlatform_idx" ON "CreatorProfile"("primaryPlatform");

-- CreateIndex
CREATE INDEX "CreatorProfile_totalFollowers_idx" ON "CreatorProfile"("totalFollowers" DESC);

-- CreateIndex
CREATE INDEX "PlatformAccount_platform_idx" ON "PlatformAccount"("platform");

-- CreateIndex
CREATE INDEX "PlatformAccount_platformUsername_idx" ON "PlatformAccount"("platformUsername");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAccount_platform_platformUserId_key" ON "PlatformAccount"("platform", "platformUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAccount_creatorProfileId_platform_key" ON "PlatformAccount"("creatorProfileId", "platform");

-- CreateIndex
CREATE INDEX "MetricSnapshot_creatorProfileId_platform_snapshotAt_idx" ON "MetricSnapshot"("creatorProfileId", "platform", "snapshotAt");

-- CreateIndex
CREATE INDEX "MetricSnapshot_snapshotAt_idx" ON "MetricSnapshot"("snapshotAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimRequest_challengeCode_key" ON "ClaimRequest"("challengeCode");

-- CreateIndex
CREATE INDEX "ClaimRequest_creatorProfileId_idx" ON "ClaimRequest"("creatorProfileId");

-- CreateIndex
CREATE INDEX "ClaimRequest_userId_idx" ON "ClaimRequest"("userId");

-- CreateIndex
CREATE INDEX "ClaimRequest_status_idx" ON "ClaimRequest"("status");

-- CreateIndex
CREATE INDEX "TalentManagerAccess_managerId_idx" ON "TalentManagerAccess"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentManagerAccess_managerId_creatorProfileId_key" ON "TalentManagerAccess"("managerId", "creatorProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_twitchGameId_key" ON "Game"("twitchGameId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_igdbId_key" ON "Game"("igdbId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE INDEX "Game_currentViewers_idx" ON "Game"("currentViewers" DESC);

-- CreateIndex
CREATE INDEX "Game_name_idx" ON "Game"("name");

-- CreateIndex
CREATE INDEX "GameViewerSnapshot_gameId_snapshotAt_idx" ON "GameViewerSnapshot"("gameId", "snapshotAt");

-- CreateIndex
CREATE INDEX "GameViewerSnapshot_snapshotAt_idx" ON "GameViewerSnapshot"("snapshotAt");

-- CreateIndex
CREATE INDEX "CreatorGrowthRollup_trendDirection_idx" ON "CreatorGrowthRollup"("trendDirection");

-- CreateIndex
CREATE INDEX "CreatorGrowthRollup_delta7d_idx" ON "CreatorGrowthRollup"("delta7d" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorGrowthRollup_creatorProfileId_platform_key" ON "CreatorGrowthRollup"("creatorProfileId", "platform");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAccount" ADD CONSTRAINT "PlatformAccount_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimRequest" ADD CONSTRAINT "ClaimRequest_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimRequest" ADD CONSTRAINT "ClaimRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentManagerAccess" ADD CONSTRAINT "TalentManagerAccess_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentManagerAccess" ADD CONSTRAINT "TalentManagerAccess_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandPartnership" ADD CONSTRAINT "BrandPartnership_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameViewerSnapshot" ADD CONSTRAINT "GameViewerSnapshot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorGrowthRollup" ADD CONSTRAINT "CreatorGrowthRollup_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
