import type { Vertical } from "@twitchmetrics/database";
import { VERTICAL_ORDER } from "@/lib/constants/categories";

export const PUBLIC_GAME_PAGE_SIZE = 20;
export const MAX_PUBLIC_GAME_PAGE_SIZE = 100;

export const GAME_SORT_VALUES = [
  "viewers",
  "channels",
  "hoursWatched",
] as const;

export type GameSort = (typeof GAME_SORT_VALUES)[number];
export type GameVerticalFilter = Vertical | "all";

export type NormalizedGameListFilters = {
  sort: GameSort;
  vertical: GameVerticalFilter;
  genre: string | null;
  query: string | null;
  page: number;
  limit: number;
  skip: number;
};

type GameListFilterInput = {
  sort?: string | null | undefined;
  vertical?: string | null | undefined;
  genre?: string | null | undefined;
  query?: string | null | undefined;
  page?: number | undefined;
  limit?: number | undefined;
};

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

export function normalizeGameSort(value: string | null | undefined): GameSort {
  return GAME_SORT_VALUES.includes(value as GameSort)
    ? (value as GameSort)
    : "viewers";
}

export function normalizeGameVertical(
  value: string | null | undefined,
): GameVerticalFilter {
  if (value === "all") return "all";
  return VERTICAL_ORDER.includes(value as Vertical)
    ? (value as Vertical)
    : "gaming";
}

export function normalizeGameListFilters(
  input: GameListFilterInput,
): NormalizedGameListFilters {
  const vertical = normalizeGameVertical(input.vertical);
  const page = normalizePositiveInteger(input.page, 1);
  const requestedLimit = normalizePositiveInteger(
    input.limit,
    PUBLIC_GAME_PAGE_SIZE,
  );
  const limit = Math.min(requestedLimit, MAX_PUBLIC_GAME_PAGE_SIZE);

  return {
    sort: normalizeGameSort(input.sort),
    vertical,
    genre: vertical === "gaming" ? normalizeText(input.genre) : null,
    query: normalizeText(input.query),
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function getPublicGameListCacheKey(filters: NormalizedGameListFilters) {
  return [
    "games:list:v2",
    `p${filters.page}`,
    `l${filters.limit}`,
    `s${filters.sort}`,
    `q${encodeURIComponent(filters.query ?? "")}`,
    `g${encodeURIComponent(filters.genre ?? "")}`,
    `v${filters.vertical}`,
  ].join(":");
}
