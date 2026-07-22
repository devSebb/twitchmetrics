import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";
import { cacheGet, cacheSet, CACHE_TTL } from "@/server/services/cache";
import { resolveCreatorSlug } from "@/server/services/creator-visibility";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const rateLimited = await rateLimitOrResponse(request, "creator-detail", {
    limit: 120,
    window: "60 s",
  });
  if (rateLimited) return rateLimited;

  const { slug } = await context.params;
  const resolution = await resolveCreatorSlug(db, slug);
  if (!resolution.found) {
    return NextResponse.json(
      {
        data: null,
        meta: {},
        error: "Creator not found",
      },
      { status: 404 },
    );
  }
  if (resolution.redirect) {
    return NextResponse.redirect(
      new URL(`/api/creators/${resolution.canonicalSlug}`, request.url),
      308,
    );
  }

  const cacheKey = `creator:v2:${resolution.canonicalSlug}`;

  // Check cache first
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json({ data: cached, meta: {} });
  }

  const creator = await db.creatorProfile.findUnique({
    where: { id: resolution.id },
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

  // The resolution and detail reads are intentionally separate so cached
  // responses can never bypass a newly-created merge redirect.
  if (!creator) {
    return NextResponse.json(
      { data: null, meta: {}, error: "Creator not found" },
      { status: 404 },
    );
  }

  const serialized = serializeBigInt(creator);

  // Cache serialized result (non-blocking)
  await cacheSet(cacheKey, serialized, CACHE_TTL.CREATOR_PROFILE);

  return NextResponse.json({ data: serialized, meta: {} });
}
