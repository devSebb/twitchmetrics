import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { Container } from "@/components/ui/Editorial";
import { CookiePreferencesButton } from "@/components/legal/CookieNotice";
import { NewsletterForm } from "./NewsletterForm";
const sections = [
  {
    title: "Explore",
    links: [
      ["Channels", "/creators"],
      ["Categories", "/browse"],
      ["Reports", "/reports"],
    ],
  },
  {
    title: "For you",
    links: [
      ["Claim your profile", "/claim"],
      ["For creators", "/solutions/creators"],
      ["For talent managers", "/solutions/talent-managers"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "/about"],
      ["Contact", "/contact"],
    ],
  },
];
export function Footer() {
  return (
    <footer className="noticed border-t border-n-line">
      <Container className="py-12 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" aria-label="Noticed home">
              <Wordmark />
            </Link>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-n-slate">
              Your work, your audience, one link. Creator media kits and
              analytics, powered by Hatchet.
            </p>
          </div>
          {sections.map((section) => (
            <nav key={section.title} aria-label={section.title}>
              <h2 className="n-eyebrow text-n-slate">{section.title}</h2>
              <ul className="mt-4 space-y-3">
                {section.links.map(([label, href]) => (
                  <li key={href}>
                    <Link
                      href={href!}
                      className="inline-block py-1 text-sm hover:underline"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 grid gap-6 border-t border-n-line pt-8 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              Keep up with the creator economy.
            </h2>
            <p className="mt-2 text-sm text-n-slate">
              News and updates in your inbox.
            </p>
          </div>
          <div className="w-full max-w-md md:justify-self-end">
            <NewsletterForm />
          </div>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-6 border-t border-n-line pt-6">
          <p className="text-xs text-n-slate">
            © {new Date().getFullYear()} Noticed. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-n-slate">
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/cookies" className="hover:underline">
              Cookies
            </Link>
            <CookiePreferencesButton />
          </div>
        </div>
      </Container>
    </footer>
  );
}
