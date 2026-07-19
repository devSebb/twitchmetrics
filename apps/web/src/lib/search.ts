export const SEARCH_TYPES = ["all", "creators", "games"] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

export function normalizeSearchType(
  value: string | null | undefined,
): SearchType {
  return SEARCH_TYPES.includes(value as SearchType)
    ? (value as SearchType)
    : "all";
}

export function getSearchScopes(type: SearchType) {
  return {
    creators: type !== "games",
    games: type !== "creators",
  };
}

export function buildSearchUrl(query: string, type: SearchType = "all") {
  const params = new URLSearchParams({ q: query.trim() });
  if (type !== "all") params.set("type", type);
  return `/search?${params.toString()}`;
}
