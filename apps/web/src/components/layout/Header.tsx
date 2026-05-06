import Link from "next/link";
import Image from "next/image";
import { SearchBar } from "@/components/search";
import { getSession } from "@/server/auth-cache";
import { HeaderUserMenu } from "./HeaderUserMenu";

const NAV_LINKS = [
  { label: "Channels", href: "/creators" },
  { label: "Categories", href: "/browse" },
  { label: "Reports", href: "/reports" },
] as const;

export async function Header() {
  const session = await getSession();
  const user = session?.user ?? null;

  return (
    <header className="sticky top-0 z-50 border-b border-[#3F4147] bg-[#1E1F22]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
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
        <nav className="hidden items-center gap-5 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Search — pushed right */}
        <div className="ml-auto hidden w-64 sm:block lg:w-80">
          <SearchBar mode="compact" />
        </div>

        {/* Auth section */}
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          {user ? (
            <HeaderUserMenu
              name={user.name ?? null}
              image={user.image ?? null}
            />
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
      </div>
    </header>
  );
}
