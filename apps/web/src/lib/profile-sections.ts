import type { WidgetId } from "@/lib/constants/widgets";

/** Saved widget IDs stay unchanged; presentation groups only arrange enabled content. */
const SECTIONS: { id: string; title: string; widgets: WidgetId[] }[] = [
  { id: "overview", title: "At a glance.", widgets: ["stats_row"] },
  {
    id: "performance",
    title: "The detail behind the numbers.",
    widgets: ["follower_growth", "viewer_count"],
  },
  {
    id: "audience",
    title: "Meet the audience.",
    widgets: ["platform_breakdown", "demographics"],
  },
  {
    id: "content",
    title: "The work, in focus.",
    widgets: [
      "featured_clips",
      "popular_games",
      "recent_streams",
      "featured_posts",
    ],
  },
  { id: "partners", title: "Brand partners.", widgets: ["brand_partners"] },
  {
    id: "more",
    title: "More about the creator.",
    widgets: ["interests", "streamer_qualities", "rates", "brand_safety"],
  },
];

export function groupProfileWidgets(enabled: WidgetId[]) {
  const ids = new Set(enabled);
  return SECTIONS.map((section) => ({
    ...section,
    widgets: section.widgets.filter((id) => ids.has(id)),
  })).filter((section) => section.widgets.length > 0);
}

export function publicMediaKitUrl(origin: string, slug: string) {
  return `${origin.replace(/\/$/, "")}/creator/${encodeURIComponent(slug)}/media-kit`;
}
