"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SquaresFour } from "@phosphor-icons/react/dist/ssr";
import type { Platform } from "@twitchmetrics/database";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "@/components/shared";

type PillValue = "" | Platform;

const PILLS: { label: string; value: PillValue }[] = [
  { label: "All", value: "" },
  { label: "Twitch", value: "twitch" },
  { label: "YouTube", value: "youtube" },
  { label: "Instagram", value: "instagram" },
  { label: "TikTok", value: "tiktok" },
  { label: "X", value: "x" },
  { label: "Kick", value: "kick" },
];

export function CreatorPlatformPills() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("platform") ?? "";

  function handleSelect(value: PillValue) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("platform", value);
    } else {
      params.delete("platform");
    }
    params.delete("page");
    const next = params.toString();
    router.push(next ? `/creators?${next}` : "/creators");
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none sm:gap-3">
      {PILLS.map((pill) => {
        const isActive = active === pill.value;
        return (
          <button
            key={pill.value || "all"}
            type="button"
            onClick={() => handleSelect(pill.value)}
            className={cn(
              "flex min-w-[110px] flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors sm:text-base",
              isActive
                ? "border-[#E32C19] bg-[#E32C19] text-white"
                : "border-[#3F4147] bg-[#313338] text-[#DBDEE1] hover:border-[#4E5058] hover:bg-[#383A40]",
            )}
          >
            {pill.value ? (
              <PlatformIcon platform={pill.value} size="sm" />
            ) : (
              <SquaresFour size={20} weight="duotone" />
            )}
            <span>{pill.label}</span>
          </button>
        );
      })}
    </div>
  );
}
