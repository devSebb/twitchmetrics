"use client";

import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useCreatorNavigation } from "./CreatorNavigation";

type SortValue = "followers" | "viewership" | "peak" | "trending" | "recent";

const SORTS: { label: string; value: SortValue }[] = [
  { label: "Followers", value: "followers" },
  { label: "Viewership", value: "viewership" },
  { label: "Peak", value: "peak" },
  { label: "Trending", value: "trending" },
  { label: "Recent", value: "recent" },
];

const TIMEFRAME: Record<SortValue, string> = {
  followers: "Latest snapshots",
  viewership: "Avg viewers, last 30 days",
  peak: "Peak viewers, last 30 days",
  trending: "Last 7 days",
  recent: "Recently added",
};

const SOCIAL_PLATFORMS = new Set(["instagram", "tiktok", "x"]);

function isSortValue(value: string | null): value is SortValue {
  return (
    value === "followers" ||
    value === "viewership" ||
    value === "peak" ||
    value === "trending" ||
    value === "recent"
  );
}

export function CreatorSortControls() {
  const { navigate, choice } = useCreatorNavigation();
  const searchParams = useSearchParams();
  const param = choice.sort ?? searchParams.get("sort");
  // Instagram, TikTok and X have no viewership to sort by: the two buttons
  // are not offered there and an old link falls back to followers.
  const platform = choice.platform ?? searchParams.get("platform") ?? "";
  const isSocial = SOCIAL_PLATFORMS.has(platform);
  const sorts = isSocial
    ? SORTS.filter((s) => s.value !== "viewership" && s.value !== "peak")
    : SORTS;
  const requested: SortValue = isSortValue(param) ? param : "followers";
  const currentSort: SortValue = sorts.some((s) => s.value === requested)
    ? requested
    : "followers";
  const status = TIMEFRAME[currentSort];

  function handleSelect(value: SortValue) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", value);
    params.delete("page");
    navigate(`/creators?${params.toString()}`, { sort: value });
  }

  return (
    <div className="flex min-w-0 basis-full flex-wrap items-center justify-between gap-3 lg:flex-1">
      <div className="flex max-w-full flex-wrap gap-1 rounded-md bg-n-canvas p-0.5">
        {sorts.map((s) => {
          const isActive = currentSort === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => handleSelect(s.value)}
              aria-pressed={isActive}
              className={cn(
                "min-h-11 rounded px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-n-surface text-n-ink"
                  : "text-n-slate hover:text-n-ink",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-n-slate">
        <span>{status}</span>
      </div>
    </div>
  );
}
