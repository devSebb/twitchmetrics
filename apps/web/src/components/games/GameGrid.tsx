"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { EmptyState } from "@/components/ui/Editorial";
import { formatNumber } from "@/lib/utils/format";
import {
  normalizeGameListFilters,
  PUBLIC_GAME_PAGE_SIZE,
  type NormalizedGameListFilters,
} from "@/lib/game-list";
import { GameCoverImage } from "./GameCoverImage";

type GameData = {
  id: string;
  name: string;
  slug: string;
  coverImageUrl: string | null;
  currentViewers: number;
  currentChannels: number;
  genres: string[];
};

type ApiResponse = {
  data: GameData[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

type GameGridProps = {
  initialFilters: Pick<
    NormalizedGameListFilters,
    "sort" | "vertical" | "genre"
  >;
  initialData: GameData[];
  initialMeta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export function GameGrid({
  initialData,
  initialMeta,
  initialFilters,
}: GameGridProps) {
  const searchParams = useSearchParams();
  const filters = normalizeGameListFilters({
    sort: searchParams.get("sort"),
    vertical: searchParams.get("vertical"),
    genre: searchParams.get("genre"),
  });
  const { sort, vertical } = filters;
  const genre = filters.genre ?? "";
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [sort, genre, vertical]);

  const hasServerData =
    page === 1 &&
    sort === initialFilters.sort &&
    genre === (initialFilters.genre ?? "") &&
    vertical === initialFilters.vertical;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["games", sort, genre, page, vertical],
    queryFn: async (): Promise<ApiResponse> => {
      const params = new URLSearchParams();
      params.set("sort", sort);
      params.set("page", String(page));
      params.set("limit", String(PUBLIC_GAME_PAGE_SIZE));
      if (genre) params.set("genre", genre);
      params.set("vertical", vertical);
      const res = await fetch(`/api/games?${params.toString()}`);
      if (!res.ok) throw new Error("Category directory unavailable");
      return res.json() as Promise<ApiResponse>;
    },
    ...(hasServerData
      ? { initialData: { data: initialData, meta: initialMeta } }
      : {}),
    staleTime: 30_000,
  });

  const games = data?.data ?? [];
  const meta = data?.meta ?? initialMeta;

  return (
    <div>
      {isLoading && games.length === 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/5] animate-pulse rounded bg-n-surface"
            />
          ))}
        </div>
      )}

      {isError && (
        <div role="alert" className="border-y border-n-line py-10">
          <p>We couldn’t load this selection.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="n-button n-button-secondary mt-4"
          >
            Try again
          </button>
        </div>
      )}
      {!isLoading && !isError && games.length === 0 && (
        <EmptyState>
          No {vertical === "gaming" ? "games" : "categories"} found for this
          selection. Try a different filter.
        </EmptyState>
      )}

      {games.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:grid-cols-5">
            {games.map((game: GameData, index) => (
              <Link
                key={game.id}
                href={`/game/${game.slug}`}
                className="group min-w-0 border-b border-n-line pb-5"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-n-surface">
                  <GameCoverImage
                    src={game.coverImageUrl}
                    name={game.name}
                    priority={index === 0}
                    sizes="(min-width: 1280px) 221px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                    className="object-cover transition-transform group-hover:scale-105"
                    fallbackClassName="from-n-surface to-n-surface text-n-slate"
                  />
                </div>

                <div className="pt-4">
                  <div className="break-words text-base font-bold leading-snug tracking-tight text-n-ink group-hover:underline">
                    {game.name}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-n-ink">
                    {formatNumber(game.currentViewers)}{" "}
                    <span className="font-normal text-n-slate">viewers</span>
                  </p>
                  <p className="mt-1 text-xs text-n-slate">
                    {formatNumber(game.currentChannels)} live channels
                  </p>
                  {game.genres.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {game.genres.slice(0, 2).map((genre: string) => (
                        <span
                          key={genre}
                          className="rounded border border-n-line px-2 py-1 text-xs text-n-slate"
                        >
                          {genre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {meta.totalPages > 1 && (
            <div
              aria-label="Category pages"
              className="mt-10 flex flex-wrap items-center justify-center gap-3"
            >
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="n-button n-button-secondary"
              >
                Previous
              </button>
              <span aria-live="polite" className="text-sm text-n-slate">
                Page {page} of {meta.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="n-button n-button-secondary"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
