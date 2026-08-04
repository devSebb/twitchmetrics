import { db } from "@/server/db";
import { DISCOVERABLE_CREATOR_WHERE } from "@/server/services/creator-visibility";

/**
 * Shared chunk-plan logic for the sitemap system. Used by BOTH:
 *  - app/sitemap.ts (generateSitemaps + per-chunk content), and
 *  - app/sitemap.xml/route.ts (the <sitemapindex> that lists every chunk)
 * so the two can never drift.
 */

// URLs per child sitemap. Kept well under both the sitemaps.org limit (50,000
// URLs / 50MB) and Vercel's 19.07MB ISR fallback body cap — at ~200 bytes per
// entry, 25k URLs is roughly 5MB per file.
export const CHUNK_SIZE = 25_000;

// Chunk layout: ids [0 .. creatorChunks-1] carry creators (chunk 0 also carries
// the static pages), then [creatorChunks .. creatorChunks+gameChunks-1] carry
// games. Computed from live row counts.
export async function getChunkPlan(): Promise<{
  creatorChunks: number;
  gameChunks: number;
  totalChunks: number;
}> {
  const [creatorCount, gameCount] = await Promise.all([
    db.creatorProfile.count({ where: DISCOVERABLE_CREATOR_WHERE }),
    db.game.count(),
  ]);

  // At least one creator chunk so chunk 0 always exists to host static pages,
  // even before any creators are ingested.
  const creatorChunks = Math.max(1, Math.ceil(creatorCount / CHUNK_SIZE));
  const gameChunks = Math.ceil(gameCount / CHUNK_SIZE);

  return { creatorChunks, gameChunks, totalChunks: creatorChunks + gameChunks };
}
