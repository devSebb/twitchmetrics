import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkHtml from "remark-html";

export type LegalLocale = "en" | "es";
export type LegalSlug = "terms" | "privacy";

export type LegalDocument = {
  title: string;
  lastUpdated: string;
  language: LegalLocale;
  html: string;
};

/**
 * Shift all heading levels down by one (h1→h2, h2→h3, …) so the page can use
 * a single h1 for the document title without colliding with body section headings.
 * h6 is preserved (no h7 exists in HTML).
 */
function shiftHeadings(html: string): string {
  return html
    .replace(/<(\/?)h5(?=[\s>])/g, "<$1h6")
    .replace(/<(\/?)h4(?=[\s>])/g, "<$1h5")
    .replace(/<(\/?)h3(?=[\s>])/g, "<$1h4")
    .replace(/<(\/?)h2(?=[\s>])/g, "<$1h3")
    .replace(/<(\/?)h1(?=[\s>])/g, "<$1h2");
}

const CONTENT_DIR = path.join(process.cwd(), "src", "content", "legal");

export async function loadLegalDocument(
  locale: LegalLocale,
  slug: LegalSlug,
): Promise<LegalDocument> {
  const filePath = path.join(CONTENT_DIR, locale, `${slug}.md`);
  const source = await fs.readFile(filePath, "utf8");
  const { data, content } = matter(source);

  const processed = await remark().use(remarkHtml).process(content);
  const html = shiftHeadings(String(processed));

  return {
    title: String(data.title ?? ""),
    lastUpdated: String(data.lastUpdated ?? ""),
    language: locale,
    html,
  };
}
