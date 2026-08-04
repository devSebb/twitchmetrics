import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { SITE_URL } from "@/lib/constants/seo";
import { DISCOVERABLE_CREATOR_WHERE } from "@/server/services/creator-visibility";
import { CHUNK_SIZE, getChunkPlan } from "@/server/services/sitemap-chunks";

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

// Chunk-count/layout logic lives in @/server/services/sitemap-chunks so the
// /sitemap.xml index route handler shares it and the two can never drift.
export async function generateSitemaps(): Promise<{ id: number }[]> {
  const { totalChunks } = await getChunkPlan();
  return Array.from({ length: totalChunks }, (_, id) => ({ id }));
}

export default async function sitemap({
  id: rawId,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  // Next passes id as a string in dev (route param), a number in prod builds.
  // Coerce so `id === 0` / arithmetic behave identically in both.
  const id = Number(rawId);
  const { creatorChunks } = await getChunkPlan();

  // ── Creator chunk ──────────────────────────────────────────────────────────
  if (id < creatorChunks) {
    const creators = await db.creatorProfile.findMany({
      where: DISCOVERABLE_CREATOR_WHERE,
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
