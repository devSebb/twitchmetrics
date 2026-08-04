"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CreatorCard } from "@/components/shared";
import { CreatorList } from "./CreatorList";
import { cn } from "@/lib/utils";
import type { Platform } from "@/lib/constants/platforms";

type CreatorData = {
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  totalFollowers: string;
  displayFollowers?: string;
  primaryPlatform: Platform;
  platformAccounts: { platform: Platform; platformUsername: string }[];
  growthRollup: {
    delta7d: string;
    pct7d: number;
    trendDirection: string;
  } | null;
  airTimeSeconds?: number | null;
  avgAirTimeSeconds?: number | null;
  peakViewers?: number | null;
  avgViewers?: number | null;
};

type ApiResponse = {
  data: CreatorData[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

type CreatorGridProps = {
  initialData: CreatorData[];
  initialMeta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export function CreatorGrid({ initialData, initialMeta }: CreatorGridProps) {
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform") ?? "";
  const sort = searchParams.get("sort") ?? "followers";
  const game = searchParams.get("game") ?? "";
  const view = searchParams.get("view") === "list" ? "list" : "grid";
  const pageParam = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const isDefaultParams =
    page === 1 && !platform && !game && sort === "followers" && view === "grid";

  function buildCreatorsUrl(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage > 1) {
      params.set("page", String(nextPage));
    } else {
      params.delete("page");
    }
    const next = params.toString();
    return next ? `/creators?${next}` : "/creators";
  }

  const { data, isLoading } = useQuery({
    queryKey: ["creators", platform, sort, game, page, view],
    queryFn: async (): Promise<ApiResponse> => {
      const params = new URLSearchParams();
      if (platform) params.set("platform", platform);
      params.set("sort", sort);
      if (game) params.set("game", game);
      params.set("page", String(page));
      params.set("limit", "32");
      if (view === "list") params.set("view", "list");
      const res = await fetch(`/api/creators?${params.toString()}`);
      return res.json() as Promise<ApiResponse>;
    },
    ...(isDefaultParams
      ? { initialData: { data: initialData, meta: initialMeta } }
      : {}),
    staleTime: 30_000,
  });

  const creators = data?.data ?? [];
  const meta = data?.meta ?? initialMeta;

  return (
    <div>
      {isLoading && creators.length === 0 && view === "grid" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-[220px] animate-pulse rounded-lg border border-[#3F4147] bg-[#313338]"
            />
          ))}
        </div>
      )}

      {isLoading && creators.length === 0 && view === "list" && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-lg bg-[#383A40]"
            />
          ))}
        </div>
      )}

      {!isLoading && creators.length === 0 && (
        <div className="rounded-lg border border-[#3F4147] bg-[#313338] px-6 py-10 text-center">
          <p className="text-sm text-[#949BA4]">No creators found</p>
        </div>
      )}

      {creators.length > 0 && (
        <>
          {view === "list" ? (
            <CreatorList rows={creators} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {creators.map((creator: CreatorData) => (
                <CreatorCard key={creator.slug} creator={creator} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {meta.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Link
                href={buildCreatorsUrl(Math.max(1, page - 1))}
                aria-disabled={page === 1}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  page === 1
                    ? "pointer-events-none bg-[#383A40] text-[#949BA4] opacity-40"
                    : "bg-[#383A40] text-[#DBDEE1] hover:bg-[#4E5058]",
                )}
              >
                Previous
              </Link>
              <span className="text-sm text-[#949BA4]">
                Page {page} of {meta.totalPages}
              </span>
              <Link
                href={buildCreatorsUrl(Math.min(meta.totalPages, page + 1))}
                aria-disabled={page === meta.totalPages}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  page === meta.totalPages
                    ? "pointer-events-none bg-[#383A40] text-[#949BA4] opacity-40"
                    : "bg-[#383A40] text-[#DBDEE1] hover:bg-[#4E5058]",
                )}
              >
                Next
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
