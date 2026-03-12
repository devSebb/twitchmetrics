"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CreatorCard } from "@/components/shared";
import type { Platform } from "@/lib/constants/platforms";

type CreatorData = {
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  totalFollowers: string;
  primaryPlatform: Platform;
  platformAccounts: { platform: Platform; platformUsername: string }[];
  growthRollup: {
    delta7d: string;
    pct7d: number;
    trendDirection: string;
  } | null;
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
  const [page, setPage] = useState(1);

  const isDefaultParams = page === 1 && !platform && sort === "followers";

  const { data, isLoading } = useQuery({
    queryKey: ["creators", platform, sort, page],
    queryFn: async (): Promise<ApiResponse> => {
      const params = new URLSearchParams();
      if (platform) params.set("platform", platform);
      params.set("sort", sort);
      params.set("page", String(page));
      params.set("limit", "20");
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
      {isLoading && creators.length === 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-[220px] animate-pulse rounded-lg border border-[#3F4147] bg-[#313338]"
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {creators.map((creator: CreatorData) => (
              <CreatorCard key={creator.slug} creator={creator} />
            ))}
          </div>

          {/* Pagination */}
          {meta.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md bg-[#383A40] px-4 py-2 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#4E5058] disabled:opacity-40 disabled:pointer-events-none"
              >
                Previous
              </button>
              <span className="text-sm text-[#949BA4]">
                Page {page} of {meta.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="rounded-md bg-[#383A40] px-4 py-2 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#4E5058] disabled:opacity-40 disabled:pointer-events-none"
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
