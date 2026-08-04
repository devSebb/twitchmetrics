import Link from "next/link";
import Image from "next/image";
import { SearchBar } from "@/components/search";
import { HeaderAuth } from "./HeaderAuth";
import { SolutionsDropdown } from "./SolutionsDropdown";
import { PRIMARY_NAV_LINKS } from "./header-navigation";

/**
 * Static server component — auth-dependent chrome lives in <HeaderAuth />,
 * which fetches the session client-side. Do not read the session (or any
 * other request-scoped API) here: this header wraps the whole (public) tree
 * and would force every page in it to render dynamically.
 */
export function Header() {
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

        {/* Nav links — centered and evenly spread between the logo and search bar */}
        <nav className="hidden flex-1 items-center justify-center gap-8 lg:flex xl:gap-12">
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

          <HeaderAuth />
        </div>
      </div>
    </header>
  );
}
