import { prisma } from "@twitchmetrics/database";
import { createLogger } from "@/lib/logger";

const log = createLogger("creator-enrichment");

const WINDOW_DAYS = 30;

type EnrichmentStats = {
  derivedLanguage: string | null;
  primaryGameName: string | null;
  primaryGameSlug: string | null;
  lastStreamAt: Date | null;
  isActiveLast30d: boolean;
};

/**
 * Derive primary game, language, and activity from the creator's
 * MetricSnapshot history over the last 30 days.
 */
export async function computeEnrichmentForCreator(
  creatorProfileId: string,
): Promise<EnrichmentStats> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const snapshots = await prisma.metricSnapshot.findMany({
    where: {
      creatorProfileId,
      snapshotAt: { gte: since },
    },
    select: {
      snapshotAt: true,
      extendedMetrics: true,
    },
    orderBy: { snapshotAt: "desc" },
    take: 500,
  });

  if (snapshots.length === 0) {
    return {
      derivedLanguage: null,
      primaryGameName: null,
      primaryGameSlug: null,
      lastStreamAt: null,
      isActiveLast30d: false,
    };
  }

  const gameCounts = new Map<string, number>();
  const languageCounts = new Map<string, number>();
  let lastStreamAt: Date | null = null;

  for (const snap of snapshots) {
    const ext = snap.extendedMetrics as Record<string, unknown> | null;
    if (!ext) continue;

    // Only count snapshots where the creator was live
    const wasLive =
      ext.IS_LIVE === 1 ||
      (typeof ext.LIVE_VIEWER_COUNT === "number" && ext.LIVE_VIEWER_COUNT > 0);
    if (!wasLive) continue;

    if (!lastStreamAt || snap.snapshotAt > lastStreamAt) {
      lastStreamAt = snap.snapshotAt;
    }

    const game =
      typeof ext.CURRENT_GAME === "string" && ext.CURRENT_GAME
        ? ext.CURRENT_GAME
        : null;
    if (game) {
      gameCounts.set(game, (gameCounts.get(game) ?? 0) + 1);
    }

    const language =
      typeof ext.STREAM_LANGUAGE === "string" && ext.STREAM_LANGUAGE
        ? ext.STREAM_LANGUAGE
        : typeof ext.BROADCASTER_LANGUAGE === "string" &&
            ext.BROADCASTER_LANGUAGE
          ? ext.BROADCASTER_LANGUAGE
          : null;
    if (language) {
      languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
    }
  }

  const topGame = [...gameCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topLanguage = [...languageCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];

  const primaryGameName = topGame?.[0] ?? null;
  let primaryGameSlug: string | null = null;
  if (primaryGameName) {
    const gameRow = await prisma.game.findFirst({
      where: { name: primaryGameName },
      select: { slug: true },
    });
    primaryGameSlug = gameRow?.slug ?? null;
  }

  return {
    derivedLanguage: topLanguage?.[0] ?? null,
    primaryGameName,
    primaryGameSlug,
    lastStreamAt,
    isActiveLast30d: lastStreamAt !== null,
  };
}

/**
 * Process a batch of creators: compute enrichment stats and persist.
 * Prioritises creators with the stalest `lastEnrichedAt`.
 */
export async function enrichCreatorBatch(
  batchSize: number,
): Promise<{ processed: number; updated: number }> {
  const creators = await prisma.creatorProfile.findMany({
    select: { id: true },
    orderBy: [{ lastEnrichedAt: { sort: "asc", nulls: "first" } }],
    take: batchSize,
  });

  let processed = 0;
  let updated = 0;

  for (const creator of creators) {
    try {
      const stats = await computeEnrichmentForCreator(creator.id);
      await prisma.creatorProfile.update({
        where: { id: creator.id },
        data: {
          derivedLanguage: stats.derivedLanguage,
          primaryGameName: stats.primaryGameName,
          primaryGameSlug: stats.primaryGameSlug,
          lastStreamAt: stats.lastStreamAt,
          isActiveLast30d: stats.isActiveLast30d,
          lastEnrichedAt: new Date(),
        },
      });
      processed++;
      if (
        stats.derivedLanguage ||
        stats.primaryGameName ||
        stats.lastStreamAt
      ) {
        updated++;
      }
    } catch (err) {
      log.warn(
        { err, creatorProfileId: creator.id },
        "Enrichment failed for creator",
      );
    }
  }

  return { processed, updated };
}
