"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SOLUTION_LINKS } from "./header-navigation";

export function SolutionsDropdown() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-controls={open ? "solutions-navigation" : undefined}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex items-center gap-1 whitespace-nowrap py-2 text-sm font-medium transition-colors",
          open
            ? "text-[var(--noticed-ink)]"
            : "text-[var(--noticed-slate)] hover:text-[var(--noticed-ink)]",
        )}
      >
        Who You Are
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden
          className={cn(
            "transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2">
          <div
            id="solutions-navigation"
            className="w-72 border border-t-2 border-n-line border-t-n-ink bg-n-canvas"
          >
            {SOLUTION_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="group block border-b border-n-line px-5 py-4 transition-colors last:border-b-0 hover:bg-n-surface focus-visible:!outline-offset-[-2px]"
              >
                <p className="text-sm font-bold text-n-ink group-hover:underline">
                  {item.label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-n-slate">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
