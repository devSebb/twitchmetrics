import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const rateLimited = await rateLimitOrResponse(_request, "creator-detail", {
    limit: 120,
    window: "60 s",
  });
  if (rateLimited) return rateLimited;

  const { slug } = await context.params;

  const creator = await db.creatorProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      userId: true,
      state: true,
      snapshotTier: true,
      displayName: true,
      slug: true,
      avatarUrl: true,
      bannerUrl: true,
      bio: true,
      country: true,
      primaryPlatform: true,
      totalFollowers: true,
      totalViews: true,
      searchText: true,
      createdAt: true,
      updatedAt: true,
      lastSnapshotAt: true,
      claimedAt: true,
      platformAccounts: {
        select: {
          id: true,
          creatorProfileId: true,
          platform: true,
          platformUserId: true,
          platformUsername: true,
          platformDisplayName: true,
          platformUrl: true,
          platformAvatarUrl: true,
          isOAuthConnected: true,
          lastOAuthRefresh: true,
          followerCount: true,
          followingCount: true,
          totalViews: true,
          subscriberCount: true,
          postCount: true,
          lastSyncedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      growthRollups: {
        orderBy: { computedAt: "desc" },
        select: {
          id: true,
          creatorProfileId: true,
          platform: true,
          followerCount: true,
          delta1d: true,
          delta7d: true,
          delta30d: true,
          pct1d: true,
          pct7d: true,
          pct30d: true,
          trendDirection: true,
          acceleration: true,
          computedAt: true,
          updatedAt: true,
        },
      },
      brandPartnerships: {
        where: { isPublic: true },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          creatorProfileId: true,
          brandName: true,
          brandLogoUrl: true,
          campaignName: true,
          startDate: true,
          endDate: true,
          isPublic: true,
          createdAt: true,
        },
      },
    },
  });

  if (!creator) {
    return NextResponse.json(
      {
        data: null,
        meta: {},
        error: "Creator not found",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    serializeBigInt({
      data: creator,
      meta: {},
    }),
  );
}
