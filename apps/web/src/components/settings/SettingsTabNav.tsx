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
    <div className="flex gap-1 border-b border-[#3F4147]">
      {TABS.map((tab) => {
        const isProfile = tab.href === "/dashboard/settings";
        const isActive = isProfile
          ? pathname === "/dashboard/settings" || pathname === "/settings"
          : pathname.endsWith("/security");

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-[#E32C19] text-[#F2F3F5]"
                : "border-transparent text-[#949BA4] hover:text-[#DBDEE1]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
