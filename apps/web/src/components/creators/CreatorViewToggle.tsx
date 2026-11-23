"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SquaresFour, List } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

type ViewValue = "grid" | "list";

const VIEWS: { value: ViewValue; label: string; Icon: typeof SquaresFour }[] = [
  { value: "grid", label: "Grid view", Icon: SquaresFour },
  { value: "list", label: "List view", Icon: List },
];

function isViewValue(value: string | null): value is ViewValue {
  return value === "list" || value === "grid";
}

export function CreatorViewToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = searchParams.get("view");
  const current: ViewValue = isViewValue(param) ? param : "grid";

  function handleSelect(value: ViewValue) {
    if (value === current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (value === "grid") {
      params.delete("view");
    } else {
      params.set("view", value);
    }
    params.delete("page");
    const next = params.toString();
    router.push(next ? `/creators?${next}` : "/creators");
  }

  return (
    <div className="flex w-fit gap-1 rounded-md bg-[var(--view-canvas,#1E1F22)] p-0.5">
      {VIEWS.map(({ value, label, Icon }) => {
        const isActive = current === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => handleSelect(value)}
            aria-label={label}
            aria-pressed={isActive}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded transition-colors",
              isActive
                ? "bg-[var(--view-surface,#383A40)] text-[var(--view-ink,#F2F3F5)]"
                : "text-[var(--view-muted,#949BA4)] hover:text-[var(--view-ink,#DBDEE1)]",
            )}
          >
            <Icon size={18} weight="duotone" />
          </button>
        );
      })}
    </div>
  );
}
