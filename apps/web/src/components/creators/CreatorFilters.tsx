"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const PLATFORMS = [
  { label: "All", value: "" },
  { label: "Twitch", value: "twitch", color: "#9146ff" },
  { label: "YouTube", value: "youtube", color: "#ff0000" },
  { label: "Instagram", value: "instagram", color: "#e4405f" },
  { label: "TikTok", value: "tiktok", color: "#000000" },
  { label: "X", value: "x", color: "#000000" },
  { label: "Kick", value: "kick", color: "#53fc18" },
] as const;

const SORTS = [
  { label: "Followers", value: "followers" },
  { label: "Trending", value: "trending" },
  { label: "Recent", value: "recent" },
] as const;

export function CreatorFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPlatform = searchParams.get("platform") ?? "";
  const currentSort = searchParams.get("sort") ?? "followers";

  function updateParams(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/creators?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Platform tabs */}
      <div className="flex flex-wrap gap-1 rounded-md bg-[#1E1F22] p-0.5">
        {PLATFORMS.map((p) => (
          <button
            key={p.value}
            onClick={() => updateParams("platform", p.value)}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
              currentPlatform === p.value
                ? "bg-[#383A40] text-[#F2F3F5]"
                : "text-[#949BA4] hover:text-[#DBDEE1]",
            )}
          >
            {"color" in p && (
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: p.color }}
              />
            )}
            {p.label}
          </button>
        ))}
      </div>

      {/* Sort buttons */}
      <div className="flex gap-1 rounded-md bg-[#1E1F22] p-0.5">
        {SORTS.map((s) => (
          <button
            key={s.value}
            onClick={() => updateParams("sort", s.value)}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors",
              currentSort === s.value
                ? "bg-[#383A40] text-[#F2F3F5]"
                : "text-[#949BA4] hover:text-[#DBDEE1]",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
