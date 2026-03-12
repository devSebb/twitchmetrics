import Link from "next/link";

const NAV_SECTIONS = [
  {
    title: "Product",
    links: [
      { label: "Channels", href: "/creators" },
      { label: "Games", href: "/games" },
      { label: "Reports", href: "/reports" },
    ],
  },
  {
    title: "Explore",
    links: [
      { label: "Resources", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Documentation", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "#" },
      { label: "Partners", href: "#" },
      { label: "Contact Us", href: "#" },
    ],
  },
] as const;

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[#3F4147] bg-[#1E1F22]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-[#F2F3F5]">
                {section.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Subscribe */}
          <div>
            <h3 className="text-sm font-semibold text-[#F2F3F5]">Subscribe</h3>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                type="email"
                placeholder="Email address"
                className="flex-1 rounded-md border border-[#3F4147] bg-[#313338] px-3 py-2 text-sm text-[#DBDEE1] placeholder-[#949BA4] outline-none focus:border-[#E32C19]"
              />
              <button
                type="submit"
                className="rounded-md bg-[#E32C19] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#C72615]"
              >
                →
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[#3F4147]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[#F2F3F5]">
              TwitchMetrics
            </span>
          </div>
          <div className="flex gap-6 text-xs text-[#949BA4]">
            <Link
              href="/terms"
              className="transition-colors hover:text-[#DBDEE1]"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="transition-colors hover:text-[#DBDEE1]"
            >
              Privacy
            </Link>
            <Link
              href="/cookies"
              className="transition-colors hover:text-[#DBDEE1]"
            >
              Cookies
            </Link>
          </div>
          <p className="text-xs text-[#949BA4]">
            &copy; {year} TwitchMetrics. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
