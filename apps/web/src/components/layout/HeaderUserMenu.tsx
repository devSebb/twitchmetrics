"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { getSafeImageSrc } from "@/lib/safeImage";

type HeaderUserMenuProps = {
  name: string | null;
  image: string | null;
};

export function HeaderUserMenu({ name, image }: HeaderUserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const displayName = name ?? "User";
  const avatarSrc = image ? getSafeImageSrc(image) : null;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className="flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--noticed-ink)] transition-colors hover:bg-[var(--noticed-surface)]"
      >
        {avatarSrc ? (
          <Image
            src={avatarSrc}
            alt={displayName}
            width={26}
            height={26}
            className="rounded-full"
          />
        ) : (
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--noticed-surface)] text-xs font-bold text-[var(--noticed-ink)]">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="hidden max-w-[120px] truncate xl:block">
          {displayName}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-[var(--noticed-line)] bg-[var(--noticed-canvas)] py-1 shadow-xl">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-[var(--noticed-ink)] hover:bg-[var(--noticed-surface)]"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-[var(--noticed-ink)] hover:bg-[var(--noticed-surface)]"
          >
            Settings
          </Link>
          <div className="my-1 border-t border-[var(--noticed-line)]" />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="block w-full px-4 py-2 text-left text-sm text-[var(--noticed-slate)] hover:bg-[var(--noticed-surface)] hover:text-[var(--noticed-ink)]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
