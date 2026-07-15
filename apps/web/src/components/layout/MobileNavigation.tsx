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
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#3F4147] text-[#DBDEE1] transition-colors hover:bg-[#383A40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E32C19] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E1F22]"
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
            className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-[#3F4147] bg-[#1E1F22] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#3F4147] px-5 py-4">
              <h2
                id="mobile-navigation-title"
                className="text-base font-semibold text-[#F2F3F5]"
              >
                Menu
              </h2>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => closeDrawer()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[#949BA4] transition-colors hover:bg-[#313338] hover:text-[#DBDEE1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E32C19]"
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
                  className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#949BA4]"
                >
                  Search
                </h3>
                <SearchBar mode="compact" />
              </section>

              <nav aria-label="Mobile primary navigation" className="mt-7">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#949BA4]">
                  Explore
                </h3>
                <div className="space-y-1">
                  {PRIMARY_NAV_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => closeDrawer(false)}
                      className="block rounded-lg px-3 py-3 text-base font-medium text-[#DBDEE1] transition-colors hover:bg-[#313338] hover:text-[#F2F3F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E32C19]"
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
                  className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#949BA4]"
                >
                  Solutions
                </h3>
                <div className="space-y-1">
                  {SOLUTION_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => closeDrawer(false)}
                      className="block rounded-lg px-3 py-3 transition-colors hover:bg-[#313338] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E32C19]"
                    >
                      <span className="block text-sm font-semibold text-[#F2F3F5]">
                        {link.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-[#949BA4]">
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
                    className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#949BA4]"
                  >
                    Account
                  </h3>
                  <div className="mb-2 flex items-center gap-3 rounded-lg bg-[#2B2D31] px-3 py-3">
                    {avatarSrc ? (
                      <Image
                        src={avatarSrc}
                        alt=""
                        width={36}
                        height={36}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#383A40] text-sm font-bold text-[#F2F3F5]">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 truncate text-sm font-medium text-[#DBDEE1]">
                      {displayName}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <Link
                      href="/dashboard"
                      onClick={() => closeDrawer(false)}
                      className="block rounded-lg px-3 py-3 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#313338] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E32C19]"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/dashboard/settings"
                      onClick={() => closeDrawer(false)}
                      className="block rounded-lg px-3 py-3 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#313338] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E32C19]"
                    >
                      Settings
                    </Link>
                  </div>
                </section>
              )}
            </div>

            <div className="border-t border-[#3F4147] p-5">
              {user ? (
                <button
                  type="button"
                  onClick={() => void signOut({ callbackUrl: "/" })}
                  className="w-full rounded-lg border border-[#3F4147] bg-[#313338] px-4 py-3 text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#383A40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E32C19]"
                >
                  Sign out
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Link
                    href="/login"
                    onClick={() => closeDrawer(false)}
                    className="rounded-lg border border-[#3F4147] bg-[#313338] px-4 py-3 text-center text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#383A40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E32C19]"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => closeDrawer(false)}
                    className="rounded-lg bg-[#E32C19] px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#C72615] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
