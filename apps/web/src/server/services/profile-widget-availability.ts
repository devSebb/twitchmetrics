import type { Platform, PrismaClient } from "@twitchmetrics/database";
import { getGrowthPlatforms } from "@/lib/follower-growth";
import type { ProfileDataAvailability } from "@/lib/profile-layout";
import { getPopularGames } from "@/server/services/popular-games";
import {
  getStreamHatchetAccounts,
  streamHatchetIdentityWhere,
} from "@/server/services/streamhatchet-identity";
import { getViewerHistory } from "@/server/services/viewer-history";

const GROWTH_DEFAULT_PERIOD_DAYS = 30;

/**
 * Server-side "does this widget have data" checks for the widgets that load
 * their data client-side and self-hide when empty. The profile layout packs
 * only the widgets that will render, so a missing card never leaves a hole.
 *
 * Each check follows the widget's own data path (same service / same query
 * window). A failed check reports `true`: the card then renders and its
 * client-side self-hide stays the safety net, rather than hiding real data.
 */
export async function getProfileDataAvailability(
  prisma: PrismaClient,
  profile: {
    id: string;
    primaryPlatform: Platform;
    platformAccounts: { platform: Platform; discoverySource?: string | null }[];
  },
): Promise<ProfileDataAvailability> {
  const orTrue = (check: Promise<boolean>) => check.catch(() => true);

  const [popular_games, recent_streams, viewer_count, follower_growth] =
    await Promise.all([
      orTrue(hasPopularGames(prisma, profile.id)),
      orTrue(hasRecentStreams(prisma, profile)),
      orTrue(hasViewerHistory(prisma, profile)),
      orTrue(hasFollowerGrowth(prisma, profile)),
    ]);

  // Clips are Twitch-only (stored, else a live Twitch fetch). Without a
  // Twitch account the widget is always empty; with one it stays
  // client-decided — it is always its own full-width row, so hiding late
  // collapses the row without leaving a hole.
  const featured_clips = profile.platformAccounts.some(
    (account) => account.platform === "twitch",
  );

  return {
    popular_games,
    recent_streams,
    viewer_count,
    follower_growth,
    featured_clips,
  };
}

async function hasPopularGames(
  prisma: PrismaClient,
  creatorProfileId: string,
): Promise<boolean> {
  const games = await getPopularGames(prisma, { creatorProfileId, limit: 1 });
  return games.length > 0;
}

// Recent Streams merges Twitch VODs (live Twitch API) with StreamHatchet
// sessions. The VOD list can't be checked without calling Twitch, so a Twitch
// account counts as present; the widget still self-hides if Twitch has none.
async function hasRecentStreams(
  prisma: PrismaClient,
  profile: { id: string; platformAccounts: { platform: Platform }[] },
): Promise<boolean> {
  if (profile.platformAccounts.some((a) => a.platform === "twitch")) {
    return true;
  }
  const where = streamHatchetIdentityWhere(
    await getStreamHatchetAccounts(prisma, profile.id),
  );
  if (where.length === 0) return false;
  const session = await prisma.streamSessionFact.findFirst({
    where: { OR: where },
    select: { id: true },
  });
  return session !== null;
}

async function hasViewerHistory(
  prisma: PrismaClient,
  profile: { id: string; primaryPlatform: Platform },
): Promise<boolean> {
  const history = await getViewerHistory(prisma, {
    creatorProfileId: profile.id,
    platform: profile.primaryPlatform,
    period: "30d",
  });
  return history.points.length > 0;
}

async function hasFollowerGrowth(
  prisma: PrismaClient,
  profile: {
    id: string;
    primaryPlatform: Platform;
    platformAccounts: { platform: Platform; discoverySource?: string | null }[];
  },
): Promise<boolean> {
  const [platform] = getGrowthPlatforms(
    profile.platformAccounts,
    profile.primaryPlatform,
  );
  if (!platform) return false;
  const since = new Date(
    Date.now() - GROWTH_DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );
  const snapshot = await prisma.metricSnapshot.findFirst({
    where: {
      creatorProfileId: profile.id,
      platform,
      snapshotAt: { gte: since },
    },
    select: { id: true },
  });
  return snapshot !== null;
}
