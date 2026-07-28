import Link from "next/link";
import Image from "next/image";
import { CookiePreferencesButton } from "@/components/legal/CookieNotice";
import { NewsletterForm } from "./NewsletterForm";

const NAV_SECTIONS = [
  {
    title: "Product",
    links: [
      { label: "Channels", href: "/creators" },
      { label: "Categories", href: "/browse" },
      { label: "Reports", href: "/reports" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "/about" },
      { label: "Contact Us", href: "/contact" },
    ],
  },
] as const;

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[#3F4147] bg-[#1E1F22]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
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
            <NewsletterForm />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[#3F4147]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row">
          <Link href="/" className="relative flex h-8 flex-shrink-0">
            <Image
              src="/brand/logo.png"
              alt="TwitchMetrics"
              width={160}
              height={43}
              className="h-8 w-auto object-contain object-left"
            />
          </Link>
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
            <CookiePreferencesButton />
          </div>
          <p className="text-xs text-[#949BA4]">
            &copy; {year} TwitchMetrics. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
