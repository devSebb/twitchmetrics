"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Badge } from "@/components/ui";
import { trpc } from "@/lib/trpc";

type SidebarUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
};

type SidebarCreatorProfile = {
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  state: string;
} | null;

type SidebarProps = {
  user: SidebarUser;
  creatorProfile: SidebarCreatorProfile;
};

type NavItem = {
  label: string;
  href: string;
};

function roleLabel(role: string): string {
  return role.replace("_", " ");
}

function getNavItems(
  role: string,
  creatorProfile: SidebarCreatorProfile,
): NavItem[] {
  if (role === "admin") {
    return [
      { label: "Home", href: "/dashboard/home" },
      { label: "Claim Reviews", href: "/dashboard/admin/claims" },
      { label: "Manage Creators", href: "/dashboard/admin/manage-creators" },
      { label: "Settings", href: "/dashboard/settings" },
    ];
  }

  if (role === "talent_manager") {
    return [
      { label: "Home", href: "/dashboard/home" },
      { label: "Roster", href: "/dashboard/roster" },
      { label: "Settings", href: "/dashboard/settings" },
    ];
  }

  const creatorItems: NavItem[] = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Home", href: "/dashboard/home" },
    { label: "Analytics", href: "/dashboard/analytics" },
    { label: "Connected Platforms", href: "/dashboard/connections" },
    { label: "Settings", href: "/dashboard/settings" },
  ];
  if (
    !creatorProfile ||
    (creatorProfile.state !== "claimed" && creatorProfile.state !== "premium")
  ) {
    creatorItems.splice(3, 0, {
      label: "Claim Profile",
      href: "/dashboard/claim",
    });
  }
  return creatorItems;
}

export function Sidebar({ user, creatorProfile }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const pendingClaimsQuery = trpc.claim.listPending.useQuery(
    { page: 1, limit: 1 },
    { enabled: user.role === "admin" },
  );

  const items = useMemo(
    () => getNavItems(user.role, creatorProfile),
    [creatorProfile, user.role],
  );

  const wrapperClass = collapsed ? "w-[76px]" : "w-72";

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen((value) => !value)}
        className="fixed left-4 top-4 z-50 rounded-md border border-[#3F4147] bg-[#1E1F22] px-3 py-2 text-xs text-[#DBDEE1] md:hidden"
      >
        Menu
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-40 ${wrapperClass} transform border-r border-[#3F4147] bg-[#1E1F22] transition-transform md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[#3F4147] px-4 py-4">
            <Link href="/" className="text-lg font-bold text-[#F2F3F5]">
              {collapsed ? "TM" : "TwitchMetrics"}
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="hidden rounded-md border border-[#3F4147] px-2 py-1 text-xs text-[#949BA4] hover:text-[#DBDEE1] md:inline-block"
            >
              {collapsed ? ">" : "<"}
            </button>
          </div>

          <div className="border-b border-[#3F4147] p-4">
            {!collapsed ? (
              <div className="space-y-2">
                <p className="truncate text-sm font-semibold text-[#F2F3F5]">
                  {user.name ?? "Unnamed user"}
                </p>
                <p className="truncate text-xs text-[#949BA4]">
                  {user.email ?? "No email"}
                </p>
                <Badge variant="outline" className="capitalize">
                  {roleLabel(user.role)}
                </Badge>
              </div>
            ) : (
              <div className="h-8 w-8 rounded-full bg-[#313338]" />
            )}
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {items.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const isClaimReviews = item.href === "/dashboard/admin/claims";
              const pendingCount = pendingClaimsQuery.data?.total ?? 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-[#E32C19]/20 text-[#F2F3F5]"
                      : "text-[#949BA4] hover:bg-[#313338] hover:text-[#DBDEE1]"
                  }`}
                >
                  <span>{collapsed ? item.label.charAt(0) : item.label}</span>
                  {isClaimReviews && pendingCount > 0 && !collapsed ? (
                    <Badge>{pendingCount}</Badge>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-[#3F4147] p-3">
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full rounded-md border border-[#3F4147] px-3 py-2 text-sm text-[#DBDEE1] hover:bg-[#313338]"
            >
              {collapsed ? "Out" : "Sign out"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
