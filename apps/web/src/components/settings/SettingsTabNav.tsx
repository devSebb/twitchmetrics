"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Profile", href: "/dashboard/settings" },
  { label: "Security", href: "/dashboard/settings/security" },
];

export function SettingsTabNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 border-b border-n-line"
    >
      {TABS.map((tab) => {
        const isProfile = tab.href === "/dashboard/settings";
        const isActive = isProfile
          ? pathname === "/dashboard/settings"
          : pathname.endsWith("/security");

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-n-red text-n-ink"
                : "border-transparent text-n-slate hover:text-n-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
