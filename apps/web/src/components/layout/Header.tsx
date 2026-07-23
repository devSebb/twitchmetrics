import Link from "next/link";
import Image from "next/image";
import { prisma } from "@twitchmetrics/database";
import { SearchBar } from "@/components/search";
import { getSession } from "@/server/auth-cache";
import { resolveAvatar } from "@/lib/avatar";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { HeaderUserMenu } from "./HeaderUserMenu";
import { SolutionsDropdown } from "./SolutionsDropdown";
import { MobileNavigation } from "./MobileNavigation";
import { PRIMARY_NAV_LINKS } from "./header-navigation";

export async function Header() {
  const session = await getSession();
  const user = session?.user ?? null;

  // Roster invites are only fetched for users who own a creator profile.
  // Cheap indexed count keyed on userId; skipped entirely when signed-out.
  const hasCreatorProfile = user?.id
    ? (await prisma.creatorProfile.count({ where: { userId: user.id } })) > 0
    : false;

  // Resolve canonical avatar — TMs use their uploaded avatar first; creators
  // use platform/default avatars first and custom uploads as the fallback.
  let headerAvatar: string | null = user?.image ?? null;
  if (user?.id) {
    if (user.role === "talent_manager") {
      const tm = await prisma.talentManagerProfile.findUnique({
        where: { userId: user.id },
        select: { avatarUrl: true },
      });
      headerAvatar = resolveAvatar("talent_manager", {
        user: { image: user.image ?? null },
        manager: { avatarUrl: tm?.avatarUrl ?? null },
      });
    } else {
      const creator = await prisma.creatorProfile.findUnique({
        where: { userId: user.id },
        select: {
          avatarUrl: true,
          customAvatarUrl: true,
          platformAccounts: {
            select: { platformAvatarUrl: true },
          },
        },
      });
      headerAvatar = resolveAvatar(user.role, {
        user: { image: user.image ?? null },
        creator,
      });
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[#3F4147] bg-[#1E1F22]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:gap-4">
        {/* Logo */}
        <Link href="/" className="relative flex h-9 flex-shrink-0">
          <Image
            src="/brand/logo.png"
            alt="TwitchMetrics"
            width={180}
            height={48}
            className="h-9 w-auto object-contain object-left"
            priority
          />
        </Link>

        {/* Nav links */}
        <nav className="hidden items-center gap-7 lg:flex">
          {PRIMARY_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
            >
              {link.label}
            </Link>
          ))}
          <SolutionsDropdown />
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {/* Tablet search. Mobile search lives in the drawer. */}
          <div className="hidden w-48 min-w-0 md:block lg:w-56 xl:w-80">
            <SearchBar mode="compact" />
          </div>

          {/* Keep compact authenticated controls available on mobile. Signed-out
              actions move into the drawer at the narrowest breakpoint. */}
          <div
            className={
              user
                ? "flex items-center gap-1"
                : "hidden items-center gap-2 sm:flex"
            }
          >
            {user ? (
              <>
                <NotificationBell
                  userRole={user.role ?? "creator"}
                  hasCreatorProfile={hasCreatorProfile}
                />
                <HeaderUserMenu name={user.name ?? null} image={headerAvatar} />
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-md px-3 py-1.5 text-sm text-[#949BA4] transition-colors hover:bg-[#383A40] hover:text-[#DBDEE1]"
                >
                  Log In
                </Link>
                <Link
                  href="/register"
                  className="rounded-md bg-[#E32C19] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#C72615]"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>

          <MobileNavigation
            user={
              user ? { name: user.name ?? null, image: headerAvatar } : null
            }
          />
        </div>
      </div>
    </header>
  );
}
