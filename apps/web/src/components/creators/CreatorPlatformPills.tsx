"use client";

import { useSearchParams } from "next/navigation";
import { SquaresFour } from "@phosphor-icons/react/dist/ssr";
import type { Platform } from "@twitchmetrics/database";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "@/components/shared";
import { useCreatorNavigation } from "./CreatorNavigation";

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
  const { navigate, choice } = useCreatorNavigation();
  const searchParams = useSearchParams();
  // The clicked pill is selected at once, before the new list arrives.
  const active = choice.platform ?? searchParams.get("platform") ?? "";

  function handleSelect(value: PillValue) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("platform", value);
    } else {
      params.delete("platform");
    }
    params.delete("page");
    const next = params.toString();
    navigate(next ? `/creators?${next}` : "/creators", { platform: value });
  }

  return (
    // The padding (cancelled by the negative margin) leaves room for the focus
    // ring, which the scroll container would otherwise clip.
    <div className="-m-2 flex gap-2 overflow-x-auto p-2 sm:gap-3">
      {PILLS.map((pill) => {
        const isActive = active === pill.value;
        return (
          <button
            key={pill.value || "all"}
            type="button"
            onClick={() => handleSelect(pill.value)}
            aria-pressed={isActive}
            className={cn(
              "flex min-w-[100px] shrink-0 items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-medium transition-colors sm:text-base",
              isActive
                ? "border-n-red bg-n-red text-white"
                : "border-n-line bg-n-canvas text-n-ink hover:border-n-control hover:bg-n-surface",
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
