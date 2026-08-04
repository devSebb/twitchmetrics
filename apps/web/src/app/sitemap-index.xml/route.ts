import { SITE_URL } from "@/lib/constants/seo";
import { getChunkPlan } from "@/server/services/sitemap-chunks";

// Sitemap index for the chunked sitemap. Next's generateSitemaps() (in
// app/sitemap.ts) serves the children at /sitemap/<id>.xml but emits no index,
// so robots.txt's advertised /sitemap.xml would otherwise 404. This handler
// lists every chunk so crawlers can discover all of them.
//
// NOTE: this lives at /sitemap-index.xml (not /sitemap.xml) because app/
// sitemap.ts — even with generateSitemaps() — claims the /sitemap.xml route
// in Next 15, causing a "Duplicate page detected" conflict that the metadata
// route wins. Middleware (src/middleware.ts) rewrites /sitemap.xml here, so
// the canonical URL advertised in robots.txt keeps working.

// The chunk count changes slowly — regenerate at most hourly instead of
// hitting the DB on every crawl.
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const { totalChunks } = await getChunkPlan();

  const entries = Array.from(
    { length: totalChunks },
    (_, id) =>
      `  <sitemap>\n    <loc>${SITE_URL}/sitemap/${id}.xml</loc>\n  </sitemap>`,
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
