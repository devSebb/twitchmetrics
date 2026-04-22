import { prisma } from "@twitchmetrics/database";
import { fetchClips } from "@/server/adapters/twitch";
import { createLogger } from "@/lib/logger";

const log = createLogger("clip-sync");

const CLIP_FETCH_LIMIT = 12;
const RESYNC_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20h

/**
 * Refresh the top N clips for a creator from Twitch.
 *
 * Wipes clips not in the latest top-N and upserts the rest. Throttled
 * to at most once per 20h per creator so tier1's 6h snapshot cadence
 * doesn't hammer the Clips API unnecessarily (clips change slowly).
 */
export async function refreshCreatorClips(
  creatorProfileId: string,
  platformUserId: string,
): Promise<{ synced: number; skipped: boolean }> {
  // Skip if synced recently
  const mostRecent = await prisma.creatorClip.findFirst({
    where: { creatorProfileId },
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });

  if (
    mostRecent &&
    Date.now() - mostRecent.syncedAt.getTime() < RESYNC_MIN_INTERVAL_MS
  ) {
    return { synced: 0, skipped: true };
  }

  let clips;
  try {
    clips = await fetchClips(platformUserId, CLIP_FETCH_LIMIT);
  } catch (err) {
    log.warn(
      { err, creatorProfileId, platformUserId },
      "Failed to fetch clips",
    );
    return { synced: 0, skipped: true };
  }

  // Resolve game names from DB (best-effort — skipped if game not tracked)
  const twitchGameIds = clips
    .map((c) => c.gameId)
    .filter((id): id is string => id !== null);
  const games =
    twitchGameIds.length > 0
      ? await prisma.game.findMany({
          where: { twitchGameId: { in: twitchGameIds } },
          select: { twitchGameId: true, name: true },
        })
      : [];
  const gameNameById = new Map(
    games.map((g) => [g.twitchGameId!, g.name] as const),
  );

  // Wipe clips not in the latest top-N so the list stays fresh
  const keepIds = clips.map((c) => c.id);
  await prisma.creatorClip.deleteMany({
    where: {
      creatorProfileId,
      ...(keepIds.length > 0 ? { clipId: { notIn: keepIds } } : {}),
    },
  });

  for (const clip of clips) {
    await prisma.creatorClip.upsert({
      where: {
        creatorProfileId_clipId: { creatorProfileId, clipId: clip.id },
      },
      update: {
        title: clip.title,
        thumbnailUrl: clip.thumbnailUrl,
        url: clip.url,
        viewCount: clip.viewCount,
        duration: clip.duration,
        gameName: clip.gameId ? (gameNameById.get(clip.gameId) ?? null) : null,
        language: clip.language,
        createdAt: new Date(clip.createdAt),
      },
      create: {
        creatorProfileId,
        clipId: clip.id,
        title: clip.title,
        thumbnailUrl: clip.thumbnailUrl,
        url: clip.url,
        viewCount: clip.viewCount,
        duration: clip.duration,
        gameName: clip.gameId ? (gameNameById.get(clip.gameId) ?? null) : null,
        language: clip.language,
        createdAt: new Date(clip.createdAt),
      },
    });
  }

  return { synced: clips.length, skipped: false };
}
