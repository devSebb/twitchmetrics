import Link from "next/link";
import { SearchBar } from "@/components/search";

const NAV_LINKS = [
  { label: "Channels", href: "/creators" },
  { label: "Games", href: "/games" },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#3F4147] bg-[#1E1F22]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex-shrink-0">
          <span className="text-lg font-bold text-[#F2F3F5]">
            TwitchMetrics
          </span>
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

        {/* Auth buttons */}
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <Link
            href="/login"
            className="rounded-md px-3 py-1.5 text-sm text-[#949BA4] transition-colors hover:bg-[#383A40] hover:text-[#DBDEE1]"
          >
            Log In
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-[#E32C19] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#C72615]"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </header>
  );
}
