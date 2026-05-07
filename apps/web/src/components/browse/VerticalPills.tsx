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
  const active = searchParams.get("vertical") ?? "gaming";

  function handleSelect(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("vertical", value);
    params.delete("genre");
    params.delete("page");
    router.push(`/browse?${params.toString()}`);
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none sm:gap-3">
      {PILLS.map((pill) => {
        const isActive = active === pill.value;
        const Icon = pill.Icon;
        return (
          <button
            key={pill.value}
            onClick={() => handleSelect(pill.value)}
            className={cn(
              "flex min-w-[110px] flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors sm:text-base",
              isActive
                ? "border-[#E32C19] bg-[#E32C19] text-white"
                : "border-[#3F4147] bg-[#313338] text-[#DBDEE1] hover:border-[#4E5058] hover:bg-[#383A40]",
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
