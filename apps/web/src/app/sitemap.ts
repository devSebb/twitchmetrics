import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { SITE_URL } from "@/lib/constants/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [creators, games] = await Promise.all([
    db.creatorProfile.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { totalFollowers: "desc" },
    }),
    db.game.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { currentViewers: "desc" },
    }),
  ]);

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
      url: `${SITE_URL}/games`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/reports`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  const creatorPages: MetadataRoute.Sitemap = creators.map((c) => ({
    url: `${SITE_URL}/creator/${c.slug}`,
    lastModified: c.updatedAt,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  const gamePages: MetadataRoute.Sitemap = games.map((g) => ({
    url: `${SITE_URL}/game/${g.slug}`,
    lastModified: g.updatedAt,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...creatorPages, ...gamePages];
}
