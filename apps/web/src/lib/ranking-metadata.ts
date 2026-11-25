import type { Metadata } from "next";
import { SITE_NAME, SITE_URL, TWITTER_HANDLE } from "@/lib/constants/seo";

/** Metadata every ranking page shares: self-canonical, dated, summarised. */
export function rankingMetadata(opts: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = `${SITE_URL}${opts.path}`;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${opts.title} | ${SITE_NAME}`,
      description: opts.description,
      type: "website",
      url,
    },
    twitter: {
      card: "summary",
      site: TWITTER_HANDLE,
      title: `${opts.title} | ${SITE_NAME}`,
      description: opts.description,
    },
  };
}

/** A summary cut to a search-result length on a word boundary. */
export function metaDescription(text: string, limit = 158): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}
