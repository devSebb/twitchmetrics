import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { SITE_URL } from "@/lib/constants/seo";

// URLs per child sitemap. Kept well under both the sitemaps.org limit (50,000
// URLs / 50MB) and Vercel's 19.07MB ISR fallback body cap — at ~200 bytes per
// entry, 25k URLs is roughly 5MB per file.
const CHUNK_SIZE = 25_000;

const staticPages: MetadataRoute.Sitemap = [
  {
    url: SITE_URL,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 1.0,
  },
  {
    url: `${SITE_URL}/creators`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.9,
  },
  {
    url: `${SITE_URL}/browse`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.9,
  },
  {
    url: `${SITE_URL}/browse?vertical=irl`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.7,
  },
  {
    url: `${SITE_URL}/browse?vertical=music`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.6,
  },
  {
    url: `${SITE_URL}/browse?vertical=creative`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.6,
  },
  {
    url: `${SITE_URL}/browse?vertical=sports`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.6,
  },
  {
    url: `${SITE_URL}/reports`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.7,
  },
  {
    url: `${SITE_URL}/about`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.75,
  },
  {
    url: `${SITE_URL}/contact`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.5,
  },
];

// Chunk layout: ids [0 .. creatorChunks-1] carry creators (chunk 0 also carries
// the static pages), then [creatorChunks .. creatorChunks+gameChunks-1] carry
// games. Computed once at build/regeneration time from live row counts.
async function getChunkPlan() {
  const [creatorCount, gameCount] = await Promise.all([
    db.creatorProfile.count(),
    db.game.count(),
  ]);

  // At least one creator chunk so chunk 0 always exists to host static pages,
  // even before any creators are ingested.
  const creatorChunks = Math.max(1, Math.ceil(creatorCount / CHUNK_SIZE));
  const gameChunks = Math.ceil(gameCount / CHUNK_SIZE);

  return { creatorChunks, gameChunks };
}

export async function generateSitemaps(): Promise<{ id: number }[]> {
  const { creatorChunks, gameChunks } = await getChunkPlan();
  const total = creatorChunks + gameChunks;
  return Array.from({ length: total }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const { creatorChunks } = await getChunkPlan();

  // ── Creator chunk ──────────────────────────────────────────────────────────
  if (id < creatorChunks) {
    const creators = await db.creatorProfile.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { totalFollowers: "desc" },
      skip: id * CHUNK_SIZE,
      take: CHUNK_SIZE,
    });

    const creatorPages: MetadataRoute.Sitemap = creators.map((c) => ({
      url: `${SITE_URL}/creator/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));

    // Static pages ride along in the first chunk only.
    return id === 0 ? [...staticPages, ...creatorPages] : creatorPages;
  }

  // ── Game chunk ──────────────────────────────────────────────────────────────
  const gameIndex = id - creatorChunks;
  const games = await db.game.findMany({
    select: { slug: true, updatedAt: true },
    orderBy: { currentViewers: "desc" },
    skip: gameIndex * CHUNK_SIZE,
    take: CHUNK_SIZE,
  });

  return games.map((g) => ({
    url: `${SITE_URL}/game/${g.slug}`,
    lastModified: g.updatedAt,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));
}
