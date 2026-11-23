import Link from "next/link";
import { SearchBar } from "@/components/search";
import { Wordmark } from "@/components/brand/Wordmark";
import { Container } from "@/components/ui/Editorial";
import { HeaderAuth } from "./HeaderAuth";
import { SolutionsDropdown } from "./SolutionsDropdown";
import { PRIMARY_NAV_LINKS } from "./header-navigation";

/** Keep this shell static. HeaderAuth alone fetches session-dependent controls,
 * preserving public SSR/ISR and avoiding request-scoped reads in this layout. */
export function Header() {
  return (
    <header className="noticed sticky top-0 z-50 border-b border-n-line">
      <Container className="flex min-h-[88px] items-center gap-4 py-4">
        <Link
          href="/"
          aria-label="Noticed, powered by Hatchet. Home"
          className="shrink-0"
        >
          <Wordmark />
        </Link>
        <nav
          aria-label="Primary navigation"
          className="hidden flex-1 items-center justify-center gap-6 lg:flex xl:gap-8"
        >
          {PRIMARY_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="py-2 text-sm font-medium text-n-slate hover:text-n-ink"
            >
              {link.label}
            </Link>
          ))}
          <SolutionsDropdown />
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="hidden w-44 md:block xl:w-56">
            <SearchBar mode="compact" appearance="noticed" />
          </div>
          <HeaderAuth />
        </div>
      </Container>
    </header>
  );
}
