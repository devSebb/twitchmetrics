"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SearchBar } from "@/components/search";
import { getSafeImageSrc } from "@/lib/safeImage";
import { PRIMARY_NAV_LINKS, SOLUTION_LINKS } from "./header-navigation";

type MobileNavigationProps = {
  user: {
    name: string | null;
    image: string | null;
  } | null;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function MobileNavigation({ user }: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousPathnameRef = useRef(pathname);
  const avatarSrc = getSafeImageSrc(user?.image);
  const displayName = user?.name ?? "User";

  const closeDrawer = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (pathname === previousPathnameRef.current) return;
    previousPathnameRef.current = pathname;
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.requestAnimationFrame(() => {
      const firstFocusable =
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      firstFocusable?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    function handleDesktopChange(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    desktopQuery.addEventListener("change", handleDesktopChange);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      desktopQuery.removeEventListener("change", handleDesktopChange);
    };
  }, [closeDrawer, open]);

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open navigation menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="mobile-navigation-drawer"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--noticed-line)] text-[var(--noticed-ink)] transition-colors hover:bg-[var(--noticed-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noticed-red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--noticed-canvas)]"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => closeDrawer()}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
          />
          <div
            id="mobile-navigation-drawer"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-navigation-title"
            className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-[var(--noticed-line)] bg-[var(--noticed-canvas)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--noticed-line)] px-5 py-4">
              <h2
                id="mobile-navigation-title"
                className="text-base font-semibold text-[var(--noticed-ink)]"
              >
                Menu
              </h2>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => closeDrawer()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--noticed-slate)] transition-colors hover:bg-[var(--noticed-surface)] hover:text-[var(--noticed-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noticed-red)]"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
              <section aria-labelledby="mobile-search-title">
                <h3
                  id="mobile-search-title"
                  className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--noticed-slate)]"
                >
                  Search
                </h3>
                <SearchBar mode="compact" appearance="noticed" />
              </section>

              <nav aria-label="Mobile primary navigation" className="mt-7">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--noticed-slate)]">
                  Explore
                </h3>
                <div className="space-y-1">
                  {PRIMARY_NAV_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => closeDrawer(false)}
                      className="block rounded-lg px-3 py-3 text-base font-medium text-[var(--noticed-ink)] transition-colors hover:bg-[var(--noticed-surface)] hover:text-[var(--noticed-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noticed-red)]"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </nav>

              <section
                aria-labelledby="mobile-solutions-title"
                className="mt-7"
              >
                <h3
                  id="mobile-solutions-title"
                  className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--noticed-slate)]"
                >
                  Solutions
                </h3>
                <div className="space-y-1">
                  {SOLUTION_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => closeDrawer(false)}
                      className="block rounded-lg px-3 py-3 transition-colors hover:bg-[var(--noticed-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noticed-red)]"
                    >
                      <span className="block text-sm font-semibold text-[var(--noticed-ink)]">
                        {link.label}
                      </span>
                      <span className="mt-0.5 block text-sm text-[var(--noticed-slate)]">
                        {link.description}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>

              {user && (
                <section
                  aria-labelledby="mobile-account-title"
                  className="mt-7"
                >
                  <h3
                    id="mobile-account-title"
                    className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--noticed-slate)]"
                  >
                    Account
                  </h3>
                  <div className="mb-2 flex items-center gap-3 rounded-lg bg-[var(--noticed-surface)] px-3 py-3">
                    {avatarSrc ? (
                      <Image
                        src={avatarSrc}
                        alt=""
                        width={36}
                        height={36}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--noticed-surface)] text-sm font-bold text-[var(--noticed-ink)]">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 truncate text-sm font-medium text-[var(--noticed-ink)]">
                      {displayName}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <Link
                      href="/dashboard"
                      onClick={() => closeDrawer(false)}
                      className="block rounded-lg px-3 py-3 text-sm font-medium text-[var(--noticed-ink)] transition-colors hover:bg-[var(--noticed-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noticed-red)]"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/dashboard/settings"
                      onClick={() => closeDrawer(false)}
                      className="block rounded-lg px-3 py-3 text-sm font-medium text-[var(--noticed-ink)] transition-colors hover:bg-[var(--noticed-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noticed-red)]"
                    >
                      Settings
                    </Link>
                  </div>
                </section>
              )}
            </div>

            <div className="border-t border-[var(--noticed-line)] p-5">
              {user ? (
                <button
                  type="button"
                  onClick={() => void signOut({ callbackUrl: "/" })}
                  className="w-full rounded-lg border border-[var(--noticed-line)] bg-[var(--noticed-surface)] px-4 py-3 text-sm font-semibold text-[var(--noticed-ink)] transition-colors hover:bg-[var(--noticed-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noticed-red)]"
                >
                  Sign out
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Link
                    href="/login"
                    onClick={() => closeDrawer(false)}
                    className="rounded-lg border border-[var(--noticed-line)] bg-[var(--noticed-surface)] px-4 py-3 text-center text-sm font-semibold text-[var(--noticed-ink)] transition-colors hover:bg-[var(--noticed-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noticed-red)]"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => closeDrawer(false)}
                    className="rounded-lg bg-[var(--noticed-red)] px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[var(--noticed-red-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
