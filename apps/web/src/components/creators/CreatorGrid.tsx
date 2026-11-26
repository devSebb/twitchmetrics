"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCreatorNavigation } from "./CreatorNavigation";
import { useQuery } from "@tanstack/react-query";
import { CreatorCard } from "@/components/shared";
import { CreatorList } from "./CreatorList";
import { cn } from "@/lib/utils";
import { PLATFORM_CONFIG, type Platform } from "@/lib/constants/platforms";

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
  initialFilters: {
    platform: string;
    sort: string;
    game: string;
    page: number;
  };
  initialData: CreatorData[];
  initialMeta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export function CreatorGrid({
  initialData,
  initialMeta,
  initialFilters,
}: CreatorGridProps) {
  const { isPending: isNavigating } = useCreatorNavigation();
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform") ?? "";
  const sort = searchParams.get("sort") ?? "followers";
  const game = searchParams.get("game") ?? "";
  const view = searchParams.get("view") === "list" ? "list" : "grid";
  const pageParam = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const hasServerData =
    view === "grid" &&
    platform === initialFilters.platform &&
    sort === initialFilters.sort &&
    game === initialFilters.game &&
    page === initialFilters.page;

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

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
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
      if (!res.ok) throw new Error("Creator directory unavailable");
      return res.json() as Promise<ApiResponse>;
    },
    ...(hasServerData
      ? { initialData: { data: initialData, meta: initialMeta } }
      : {}),
    staleTime: 30_000,
  });

  const creators = data?.data ?? [];
  const meta = data?.meta ?? initialMeta;
  // Busy from a filter click until the new list is on screen: the server
  // round trip first, then (list view) the client fetch of the same selection.
  const isBusy = isNavigating || (isFetching && creators.length > 0);

  return (
    <div aria-busy={isBusy} className="relative">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 -top-4 h-0.5 overflow-hidden rounded-full bg-n-line transition-opacity",
          isBusy ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="h-full w-1/3 animate-pulse rounded-full bg-n-red" />
      </div>
      <p role="status" className="sr-only">
        {isBusy ? "Loading creators" : ""}
      </p>
      <div
        className={cn(
          "transition-opacity duration-150",
          isBusy && "pointer-events-none opacity-50",
        )}
      >
        {isLoading && creators.length === 0 && view === "grid" && (
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[220px] animate-pulse rounded-lg border border-n-line bg-n-canvas"
              />
            ))}
          </div>
        )}

        {isLoading && creators.length === 0 && view === "list" && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-lg bg-n-surface"
              />
            ))}
          </div>
        )}

        {isError && (
          <div role="alert" className="border-y border-n-line py-10">
            <p>We couldn’t load this selection.</p>
            <button
              type="button"
              className="n-button n-button-secondary mt-4"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </div>
        )}
        {!isLoading && !isError && creators.length === 0 && (
          <div className="rounded-lg border border-n-line bg-n-canvas px-6 py-10 text-center">
            <p className="text-sm text-n-slate">No creators found</p>
          </div>
        )}

        {creators.length > 0 && (
          <>
            {view === "list" ? (
              <CreatorList rows={creators} />
            ) : (
              <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {creators.map((creator: CreatorData) => (
                  <CreatorCard
                    key={creator.slug}
                    creator={creator}
                    appearance="noticed"
                    selectedPlatform={
                      Object.hasOwn(PLATFORM_CONFIG, platform)
                        ? (platform as Platform)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {meta.totalPages > 1 && (
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3 border-t border-n-line pt-8">
                <Link
                  href={buildCreatorsUrl(Math.max(1, page - 1))}
                  aria-disabled={page === 1}
                  tabIndex={page === 1 ? -1 : undefined}
                  className={cn(
                    "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                    page === 1
                      ? "pointer-events-none bg-n-surface text-n-slate opacity-40"
                      : "bg-n-surface text-n-ink hover:bg-n-control",
                  )}
                >
                  Previous
                </Link>
                <span className="text-sm text-n-slate">
                  Page {page} of {meta.totalPages}
                </span>
                <Link
                  href={buildCreatorsUrl(Math.min(meta.totalPages, page + 1))}
                  aria-disabled={page === meta.totalPages}
                  tabIndex={page === meta.totalPages ? -1 : undefined}
                  className={cn(
                    "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                    page === meta.totalPages
                      ? "pointer-events-none bg-n-surface text-n-slate opacity-40"
                      : "bg-n-surface text-n-ink hover:bg-n-control",
                  )}
                >
                  Next
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
