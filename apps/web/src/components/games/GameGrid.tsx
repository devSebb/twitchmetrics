"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { formatNumber } from "@/lib/utils/format";

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
  initialData: GameData[];
  initialMeta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export function GameGrid({ initialData, initialMeta }: GameGridProps) {
  const searchParams = useSearchParams();
  const sort = searchParams.get("sort") ?? "viewers";
  const [page, setPage] = useState(1);

  const isDefaultParams = page === 1 && sort === "viewers";

  const { data, isLoading } = useQuery({
    queryKey: ["games", sort, page],
    queryFn: async (): Promise<ApiResponse> => {
      const params = new URLSearchParams();
      params.set("sort", sort);
      params.set("page", String(page));
      params.set("limit", "20");
      const res = await fetch(`/api/games?${params.toString()}`);
      return res.json() as Promise<ApiResponse>;
    },
    ...(isDefaultParams
      ? { initialData: { data: initialData, meta: initialMeta } }
      : {}),
    staleTime: 30_000,
  });

  const games = data?.data ?? [];
  const meta = data?.meta ?? initialMeta;

  return (
    <div>
      {isLoading && games.length === 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-[280px] animate-pulse rounded-lg border border-[#3F4147] bg-[#313338]"
            />
          ))}
        </div>
      )}

      {!isLoading && games.length === 0 && (
        <div className="rounded-lg border border-[#3F4147] bg-[#313338] px-6 py-10 text-center">
          <p className="text-sm text-[#949BA4]">No games found</p>
        </div>
      )}

      {games.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {games.map((game: GameData) => (
              <Link
                key={game.id}
                href={`/game/${game.slug}`}
                className="group overflow-hidden rounded-lg border border-[#3F4147] bg-[#313338] transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#1E1F22]">
                  {game.coverImageUrl ? (
                    <Image
                      src={game.coverImageUrl}
                      alt={game.name}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#E32C19]/20 to-[#1E1F22]">
                      <span className="text-3xl font-bold text-[#949BA4]">
                        {game.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                    {formatNumber(game.currentViewers)} viewers
                  </div>
                </div>

                <div className="p-3">
                  <div className="truncate text-sm font-semibold text-[#F2F3F5]">
                    {game.name}
                  </div>
                  <div className="mt-1 text-xs text-[#949BA4]">
                    {formatNumber(game.currentChannels)} channels
                  </div>
                  {game.genres.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {game.genres.slice(0, 2).map((genre: string) => (
                        <Badge key={genre} variant="outline">
                          {genre}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {meta.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md bg-[#383A40] px-4 py-2 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#4E5058] disabled:pointer-events-none disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-[#949BA4]">
                Page {page} of {meta.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="rounded-md bg-[#383A40] px-4 py-2 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#4E5058] disabled:pointer-events-none disabled:opacity-40"
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
