"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  GameController,
  Chats,
  MusicNote,
  Palette,
  Trophy,
  Sparkle,
  SquaresFour,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { VERTICAL_LABELS, VERTICAL_ORDER } from "@/lib/constants/categories";
import { normalizeGameVertical } from "@/lib/game-list";

const PILL_ICONS: Record<string, Icon> = {
  gaming: GameController,
  irl: Chats,
  music: MusicNote,
  creative: Palette,
  sports: Trophy,
  other: Sparkle,
  all: SquaresFour,
};

const PILLS = [
  ...VERTICAL_ORDER.map((v) => ({
    label: VERTICAL_LABELS[v],
    value: v as string,
    Icon: PILL_ICONS[v]!,
  })),
  { label: "All", value: "all", Icon: PILL_ICONS.all! },
] as const;

export function VerticalPills() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = normalizeGameVertical(searchParams.get("vertical"));

  function handleSelect(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("vertical", value);
    params.delete("genre");
    params.delete("page");
    router.push(`/browse?${params.toString()}`);
  }

  return (
    <div
      role="group"
      aria-label="Category type"
      className="flex flex-wrap gap-2 sm:gap-3"
    >
      {PILLS.map((pill) => {
        const isActive = active === pill.value;
        const Icon = pill.Icon;
        return (
          <button
            key={pill.value}
            onClick={() => handleSelect(pill.value)}
            aria-pressed={isActive}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors",
              isActive
                ? "border-n-ink bg-n-ink text-white"
                : "border-n-line bg-white text-n-slate hover:border-n-ink hover:text-n-ink",
            )}
          >
            <Icon size={20} weight="duotone" />
            <span>{pill.label}</span>
          </button>
        );
      })}
    </div>
  );
}
