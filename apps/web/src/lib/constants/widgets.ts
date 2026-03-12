/**
 * Widget registry — single source of truth for all dashboard widgets.
 * IDs, display metadata, visibility defaults, and grid layout config.
 */

export type WidgetId =
  | "stats_row"
  | "follower_growth"
  | "viewer_count"
  | "demographics"
  | "popular_games"
  | "platform_breakdown"
  | "recent_streams"
  | "featured_clips"
  | "brand_partners"
  | "brand_safety";

export type WidgetAccess = "public" | "claimed" | "connected";

export type WidgetDefinition = {
  id: WidgetId;
  label: string;
  description: string;
  defaultEnabled: boolean;
  priority: "P0" | "P1" | "P2";
  access: WidgetAccess;
  /** Grid column span at desktop (out of 3) */
  colSpan: 1 | 2 | 3;
};

export const WIDGET_REGISTRY: Record<WidgetId, WidgetDefinition> = {
  stats_row: {
    id: "stats_row",
    label: "Stats Row",
    description: "Cross-platform KPI cards with trend arrows and sparklines",
    defaultEnabled: true,
    priority: "P0",
    access: "public",
    colSpan: 3,
  },
  follower_growth: {
    id: "follower_growth",
    label: "Follower Growth",
    description: "Line chart showing follower growth with platform tabs",
    defaultEnabled: true,
    priority: "P0",
    access: "public",
    colSpan: 2,
  },
  demographics: {
    id: "demographics",
    label: "Audience Demographics",
    description: "Gender, age, and country breakdown from connected platforms",
    defaultEnabled: true,
    priority: "P0",
    access: "connected",
    colSpan: 1,
  },
  popular_games: {
    id: "popular_games",
    label: "Popular Games",
    description: "Top streamed games with cover art and viewer counts",
    defaultEnabled: true,
    priority: "P0",
    access: "public",
    colSpan: 1,
  },
  featured_clips: {
    id: "featured_clips",
    label: "Featured Clips",
    description: "Grid of clip thumbnails with view counts",
    defaultEnabled: true,
    priority: "P1",
    access: "public",
    colSpan: 2,
  },
  viewer_count: {
    id: "viewer_count",
    label: "Viewer Count",
    description: "Area chart with live indicator and peak annotations",
    defaultEnabled: true,
    priority: "P0",
    access: "public",
    colSpan: 3,
  },
  recent_streams: {
    id: "recent_streams",
    label: "Recent Streams",
    description:
      "Sortable table of recent streams with game, duration, viewers",
    defaultEnabled: true,
    priority: "P1",
    access: "public",
    colSpan: 3,
  },
  platform_breakdown: {
    id: "platform_breakdown",
    label: "Platform Breakdown",
    description: "Horizontal bar chart comparing follower counts per platform",
    defaultEnabled: true,
    priority: "P1",
    access: "public",
    colSpan: 1,
  },
  brand_partners: {
    id: "brand_partners",
    label: "Brand Partners",
    description: "Logo grid of brand partnerships, editable by claimed creator",
    defaultEnabled: true,
    priority: "P1",
    access: "claimed",
    colSpan: 2,
  },
  brand_safety: {
    id: "brand_safety",
    label: "Brand Safety",
    description: "Safety rating badge and meter",
    defaultEnabled: false,
    priority: "P2",
    access: "claimed",
    colSpan: 1,
  },
};

/**
 * Widget display order — matches Figma V7 grid layout.
 * Stats row spans full width, then 2/3 + 1/3, etc.
 */
export const WIDGET_ORDER: WidgetId[] = [
  "stats_row",
  "follower_growth",
  "demographics",
  "popular_games",
  "featured_clips",
  "viewer_count",
  "recent_streams",
  "platform_breakdown",
  "brand_partners",
  "brand_safety",
];

const DEFAULT_ENABLED_WIDGETS: WidgetId[] = Object.values(WIDGET_REGISTRY)
  .filter((w) => w.defaultEnabled)
  .map((w) => w.id);

/**
 * Resolve enabled widgets from the persisted widgetConfig JSON.
 * Empty array → all defaults. Invalid entries silently filtered.
 */
export function getEnabledWidgets(widgetConfig: unknown): WidgetId[] {
  if (!Array.isArray(widgetConfig) || widgetConfig.length === 0) {
    return DEFAULT_ENABLED_WIDGETS;
  }
  const validIds = new Set<string>(Object.keys(WIDGET_REGISTRY));
  return widgetConfig.filter(
    (id): id is WidgetId => typeof id === "string" && validIds.has(id),
  );
}

/**
 * All widget IDs that are enabled by default (for reset-to-defaults).
 */
export function getDefaultWidgets(): WidgetId[] {
  return [...DEFAULT_ENABLED_WIDGETS];
}
