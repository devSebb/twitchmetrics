"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { SearchBar } from "@/components/search";
import { getSafeImageSrc } from "@/lib/safeImage";

type NavbarUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
};

type NavbarCreatorProfile = {
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  state: string;
} | null;

type DashboardNavbarProps = {
  user: NavbarUser;
  creatorProfile: NavbarCreatorProfile;
};

const NAV_LINKS = [
  { label: "Channels", href: "/creators" },
  { label: "Games", href: "/games" },
  { label: "Our Solutions", href: "/reports" },
] as const;

export function DashboardNavbar({
  user,
  creatorProfile,
}: DashboardNavbarProps) {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pendingClaimsQuery = trpc.claim.listPending.useQuery(
    { page: 1, limit: 1 },
    { enabled: user.role === "admin" },
  );
  const pendingCount = pendingClaimsQuery.data?.total ?? 0;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  const avatarSrc = creatorProfile?.avatarUrl
    ? getSafeImageSrc(creatorProfile.avatarUrl)
    : user.image
      ? getSafeImageSrc(user.image)
      : null;

  const displayName = creatorProfile?.displayName ?? user.name ?? "User";

  return (
    <header className="sticky top-0 z-50 border-b border-[#3F4147] bg-[#1E1F22]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        {/* Logo */}
        <Link
          href="/"
          className="mr-2 shrink-0 text-lg font-bold text-[#F2F3F5]"
        >
          TwitchMetrics
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "text-[#F2F3F5]"
                    : "text-[#949BA4] hover:text-[#DBDEE1]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          {/* Pro CTA */}
          <Link
            href="/reports"
            className="ml-1 rounded-full bg-[#E32C19] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#C72615]"
          >
            Pro
          </Link>
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search — desktop */}
        <div className="hidden w-64 md:block">
          <SearchBar mode="compact" />
        </div>

        {/* Notification bell */}
        {user.role === "admin" && (
          <Link
            href="/dashboard/admin/claims"
            className="relative rounded-md p-2 text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {pendingCount > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#E32C19]" />
            )}
          </Link>
        )}

        {/* Profile dropdown — desktop */}
        <div ref={dropdownRef} className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[#DBDEE1] transition-colors hover:bg-[#313338]"
          >
            {avatarSrc ? (
              <Image
                src={avatarSrc}
                alt={displayName}
                width={28}
                height={28}
                className="rounded-full"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#383A40] text-xs font-bold text-[#F2F3F5]">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="max-w-[120px] truncate">{displayName}</span>
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

          {profileOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-[#3F4147] bg-[#1E1F22] py-1 shadow-xl">
              <Link
                href="/dashboard"
                className="block px-4 py-2 text-sm text-[#DBDEE1] hover:bg-[#313338]"
              >
                Dashboard
              </Link>
              {creatorProfile?.slug && (
                <Link
                  href={`/creator/${creatorProfile.slug}`}
                  className="block px-4 py-2 text-sm text-[#DBDEE1] hover:bg-[#313338]"
                >
                  View Profile
                </Link>
              )}
              {user.role === "talent_manager" && (
                <Link
                  href="/dashboard/roster"
                  className="block px-4 py-2 text-sm text-[#DBDEE1] hover:bg-[#313338]"
                >
                  Roster
                </Link>
              )}
              <Link
                href="/dashboard/settings"
                className="block px-4 py-2 text-sm text-[#DBDEE1] hover:bg-[#313338]"
              >
                Settings
              </Link>
              <div className="my-1 border-t border-[#3F4147]" />
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="block w-full px-4 py-2 text-left text-sm text-[#949BA4] hover:bg-[#313338] hover:text-[#DBDEE1]"
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-md p-2 text-[#DBDEE1] md:hidden"
        >
          {mobileOpen ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile slide-down panel */}
      {mobileOpen && (
        <div className="border-t border-[#3F4147] bg-[#1E1F22] px-4 pb-4 pt-2 md:hidden">
          <div className="mb-3">
            <SearchBar mode="compact" />
          </div>
          <nav className="space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-md px-3 py-2 text-sm text-[#949BA4] hover:bg-[#313338] hover:text-[#DBDEE1]"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="my-2 border-t border-[#3F4147]" />
          <div className="flex items-center gap-3 px-3 py-2">
            {avatarSrc ? (
              <Image
                src={avatarSrc}
                alt={displayName}
                width={32}
                height={32}
                className="rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#383A40] text-xs font-bold text-[#F2F3F5]">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-[#F2F3F5]">
                {displayName}
              </p>
              <p className="text-xs text-[#949BA4]">{user.email}</p>
            </div>
          </div>
          <div className="space-y-1 pl-1">
            <Link
              href="/dashboard"
              className="block rounded-md px-3 py-2 text-sm text-[#DBDEE1] hover:bg-[#313338]"
            >
              Dashboard
            </Link>
            {creatorProfile?.slug && (
              <Link
                href={`/creator/${creatorProfile.slug}`}
                className="block rounded-md px-3 py-2 text-sm text-[#DBDEE1] hover:bg-[#313338]"
              >
                View Profile
              </Link>
            )}
            {user.role === "talent_manager" && (
              <Link
                href="/dashboard/roster"
                className="block rounded-md px-3 py-2 text-sm text-[#DBDEE1] hover:bg-[#313338]"
              >
                Roster
              </Link>
            )}
            <Link
              href="/dashboard/settings"
              className="block rounded-md px-3 py-2 text-sm text-[#DBDEE1] hover:bg-[#313338]"
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-[#949BA4] hover:bg-[#313338]"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
