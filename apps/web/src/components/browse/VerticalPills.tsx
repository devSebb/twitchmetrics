"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { VERTICAL_LABELS, VERTICAL_ORDER } from "@/lib/constants/categories";

const PILLS = [
  ...VERTICAL_ORDER.map((v) => ({ label: VERTICAL_LABELS[v], value: v })),
  { label: "All", value: "all" },
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
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
      {PILLS.map((pill) => {
        const isActive = active === pill.value;
        return (
          <button
            key={pill.value}
            onClick={() => handleSelect(pill.value)}
            className={cn(
              "flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-[#E32C19] text-white"
                : "bg-[#383A40] text-[#949BA4] hover:text-[#DBDEE1]",
            )}
          >
            {pill.label}
          </button>
        );
      })}
    </div>
  );
}
