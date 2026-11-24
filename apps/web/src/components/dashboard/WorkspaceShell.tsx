"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppearanceProvider } from "@/components/ui/Appearance";
import { Container } from "@/components/ui/Editorial";

const CREATOR_LINKS = [
  ["/dashboard/home", "Home"],
  ["/dashboard", "My profile"],
  ["/media-kit", "Media kit"],
  ["/dashboard/analytics", "Private analytics"],
  ["/dashboard/connections", "Connections"],
  ["/brand-partnerships", "Partnerships"],
  ["/dashboard/settings", "Settings"],
] as const;
const MANAGER_LINKS = [
  ["/dashboard/roster", "My roster"],
  ["/dashboard/settings", "Agency & account"],
] as const;
const ALIASES: Record<string, string> = {
  "/home": "/dashboard/home",
  "/roster": "/dashboard/roster",
  "/analytics": "/dashboard/analytics",
  "/connections": "/dashboard/connections",
};

export function WorkspaceShell({
  role,
  children,
}: {
  role: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // Admin surfaces receive their own migration in the final integration chunk.
  if (role === "admin")
    return (
      <main id="main-content" className="flex-1">
        {children}
      </main>
    );
  const current = ALIASES[pathname] ?? pathname;
  const links = role === "talent_manager" ? MANAGER_LINKS : CREATOR_LINKS;
  return (
    <AppearanceProvider>
      <main id="main-content" className="noticed n-workspace flex-1">
        <div className="border-b border-n-line bg-n-surface/40">
          <Container>
            <nav
              aria-label={
                role === "talent_manager"
                  ? "Manager workspace"
                  : "Creator workspace"
              }
              className="flex gap-6 overflow-x-auto"
            >
              {links.map(([href, label]) => {
                const active =
                  current === href ||
                  (href === "/dashboard/settings" &&
                    current.startsWith(`${href}/`)) ||
                  (href === "/dashboard/roster" &&
                    current.startsWith("/talent-manager/creator/"));
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-14 shrink-0 items-center border-b-2 py-3 text-sm font-semibold ${active ? "border-n-red text-n-ink" : "border-transparent text-n-slate hover:text-n-ink"}`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </Container>
        </div>
        {children}
      </main>
    </AppearanceProvider>
  );
}
