"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SOLUTION_LINKS } from "./header-navigation";

export function SolutionsDropdown() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex items-center gap-1 text-sm transition-colors",
          open ? "text-[#DBDEE1]" : "text-[#949BA4] hover:text-[#DBDEE1]",
        )}
      >
        Solutions
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
            role="menu"
            className="w-64 overflow-hidden rounded-lg border border-[#3F4147] bg-[#2B2D31] shadow-lg"
          >
            {SOLUTION_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-3 transition-colors hover:bg-[#383A40]"
              >
                <p className="text-sm font-semibold text-[#F2F3F5]">
                  {item.label}
                </p>
                <p className="mt-0.5 text-xs text-[#949BA4]">
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
