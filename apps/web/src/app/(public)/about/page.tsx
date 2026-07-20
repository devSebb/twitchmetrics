import type { Metadata } from "next";
import Link from "next/link";
import {
  ChartLineUp,
  FileText,
  MagnifyingGlass,
  ArrowRight,
  Sparkle,
  LinkSimple,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import {
  SITE_URL,
  SITE_NAME,
  TWITTER_HANDLE,
  DEFAULT_OG_IMAGE,
} from "@/lib/constants/seo";

const PAGE_PATH = "/about";
const CANONICAL = `${SITE_URL}${PAGE_PATH}`;

const PAGE_DESCRIPTION =
  "TwitchMetrics is the free media kit for gaming creators and the talent agencies behind them. Verified, always-updating profiles across Twitch, YouTube, TikTok, Instagram, X, and Kick — powered by Stream Hatchet.";

export const metadata: Metadata = {
  title: "About Us",
  description: PAGE_DESCRIPTION,
  keywords: [
    "creator media kit",
    "free media kit",
    "creator analytics",
    "talent agency dashboard",
    "Twitch metrics",
    "Stream Hatchet",
    "creator discovery",
    "cross-platform streaming analytics",
  ],
  openGraph: {
    title: `About ${SITE_NAME} | The free media kit for creators`,
    description: PAGE_DESCRIPTION,
    type: "website",
    url: CANONICAL,
    siteName: SITE_NAME,
    images: [
      { url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    title: `About ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: { canonical: CANONICAL },
};

function AboutJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: `About ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: CANONICAL,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
    mainEntity: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      description: PAGE_DESCRIPTION,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

const PILLARS = [
  {
    icon: ChartLineUp,
    title: "Unified, verified metrics",
    body: "Followers, viewers, engagement, and growth across every platform — automatically refreshed and trusted by brands. No self-reported numbers.",
  },
  {
    icon: MagnifyingGlass,
    title: "Public discovery & creator profiles",
    body: "Browse top channels and games, search the directory, and open shareable creator pages. Creators get found. Brands and agencies source talent.",
  },
  {
    icon: FileText,
    title: "Dashboards & media kits",
    body: "Claimed profiles unlock deeper tooling: personal analytics, roster views for managers, and media kits built from regularly refreshed data — pitch-ready in one click.",
  },
] as const;

const AUDIENCES = [
  {
    icon: Sparkle,
    title: "Creators",
    body: "Get discovered by brands already using Stream Hatchet. Build your Media Kit, connect your accounts, and share one verified link that proves your reach across every platform. For free.",
    href: "/solutions/creators",
    cta: "Read more for creators",
  },
  {
    icon: UsersThree,
    title: "Talent managers & agencies",
    body: "Onboard your full roster in minutes. Track every creator across every platform in one verified dashboard. Export pitch-ready reports — no design work, no manual updates.",
    href: "/solutions/talent-managers",
    cta: "Read more for agencies",
  },
] as const;

const TAGLINE = ["One link", "Every platform", "Backed by Stream Hatchet"];

export default function AboutPage() {
  return (
    <>
      <AboutJsonLd />
      <main className="bg-[#1E1F22] text-[#F2F3F5]">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-[#3F4147]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,#E32C19_0%,transparent_55%)] opacity-20"
          />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#3F4147] bg-[#313338]/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#DBDEE1]">
                <Sparkle size={14} weight="fill" className="text-[#E32C19]" />
                About {SITE_NAME}
              </p>
              <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
                The free media kit for{" "}
                <span className="text-[#E32C19]">
                  creators and the agencies behind them.
                </span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#DBDEE1]">
                {SITE_NAME} is where gaming creators and talent agencies build
                verified, always-updating profiles to get discovered, pitch
                brands, and close deals — without spreadsheets, screenshots, or
                static PDFs.
              </p>
              <ul
                className="mt-8 flex flex-wrap gap-2"
                aria-label="Product highlights"
              >
                {TAGLINE.map((label) => (
                  <li
                    key={label}
                    className="inline-flex items-center gap-2 rounded-full border border-[#3F4147] bg-[#313338] px-3 py-1.5 text-xs font-medium text-[#DBDEE1]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#E32C19]" />
                    {label}
                  </li>
                ))}
              </ul>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
                >
                  Create your free Media Kit
                  <ArrowRight size={16} weight="bold" />
                </Link>
                <Link
                  href="#how-it-helps"
                  className="rounded-lg border border-[#3F4147] bg-[#313338] px-5 py-3 text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#383A40]"
                >
                  How it works
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* What we are building */}
        <section
          className="border-b border-[#3F4147]"
          aria-labelledby="about-mission"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
                  What we are building
                </p>
                <h2
                  id="about-mission"
                  className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
                >
                  Verified stats. Professional kit.{" "}
                  <span className="text-[#E32C19]">Ready when brands ask.</span>
                </h2>
              </div>
              <div className="space-y-5 text-base leading-relaxed text-[#DBDEE1]">
                <p>
                  Creators don&rsquo;t lack data — they lack a single place
                  where their stats are verified, professional, and ready to
                  share the moment a brand asks.
                </p>
                <p>
                  We connect Twitch, YouTube, TikTok, Instagram, X, and Kick
                  into one always-updating profile and auto-generate a media kit
                  that refreshes automatically. Metrics are refreshed from{" "}
                  <span className="text-[#F2F3F5]">Stream Hatchet</span>.
                </p>
                <p>
                  Profiles start from public data and unlock full control once
                  claimed: dashboards, roster views, exports, and
                  discoverability inside the Stream Hatchet network.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How TwitchMetrics helps */}
        <section
          id="how-it-helps"
          className="border-b border-[#3F4147] bg-[#2B2D31]"
          aria-labelledby="about-pillars"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
                How {SITE_NAME} helps
              </p>
              <h2
                id="about-pillars"
                className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
              >
                Three things, done right.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#DBDEE1]">
                Built so creators get found, agencies stay organized, and brands
                trust what they see.
              </p>
            </div>
            <ul className="mt-12 grid gap-6 md:grid-cols-3">
              {PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <li
                    key={pillar.title}
                    className="rounded-2xl border border-[#3F4147] bg-[#313338] p-6 transition-colors hover:border-[#E32C19]/60"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#E32C19]/15 text-[#E32C19]">
                      <Icon size={22} weight="bold" />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-[#F2F3F5]">
                      {pillar.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#DBDEE1]">
                      {pillar.body}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Who it is for */}
        <section
          className="border-b border-[#3F4147]"
          aria-labelledby="about-audiences"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
                Who it is for
              </p>
              <h2
                id="about-audiences"
                className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
              >
                Two sides of the same network.
              </h2>
            </div>
            <ul className="mt-12 grid gap-6 lg:grid-cols-2">
              {AUDIENCES.map((aud) => {
                const Icon = aud.icon;
                return (
                  <li
                    key={aud.title}
                    className="flex flex-col rounded-2xl border border-[#3F4147] bg-gradient-to-br from-[#313338] to-[#2B2D31] p-8 sm:p-10"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E32C19]/15 text-[#E32C19]">
                      <Icon size={24} weight="bold" />
                    </div>
                    <h3 className="mt-6 text-2xl font-bold tracking-tight text-[#F2F3F5]">
                      {aud.title}
                    </h3>
                    <p className="mt-3 text-base leading-relaxed text-[#DBDEE1]">
                      {aud.body}
                    </p>
                    <Link
                      href={aud.href}
                      className="mt-6 inline-flex items-center gap-2 self-start text-sm font-semibold text-[#E32C19] transition-opacity hover:opacity-80"
                    >
                      {aud.cta}
                      <ArrowRight size={14} weight="bold" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Explore the product */}
        <section
          className="border-b border-[#3F4147] bg-[#2B2D31]"
          aria-labelledby="about-explore"
        >
          <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
            <div className="overflow-hidden rounded-3xl border border-[#3F4147] bg-gradient-to-br from-[#313338] via-[#2B2D31] to-[#1E1F22] p-10 text-center sm:p-14">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
                Explore the product
              </p>
              <h2
                id="about-explore"
                className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
              >
                See what your profile could look like.
              </h2>
              <p className="mt-4 text-base text-[#DBDEE1]">
                Or dive into the latest trends, top channels, and creator
                comparisons.
              </p>
              <nav
                className="mt-8 flex flex-wrap justify-center gap-3"
                aria-label="Key product areas"
              >
                <Link
                  href="/creators"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#3F4147] bg-[#313338] px-4 py-2.5 text-sm font-medium text-[#DBDEE1] transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
                >
                  <LinkSimple
                    size={14}
                    weight="bold"
                    className="text-[#E32C19]"
                  />
                  Top creators
                </Link>
                <Link
                  href="/browse"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#3F4147] bg-[#313338] px-4 py-2.5 text-sm font-medium text-[#DBDEE1] transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
                >
                  <MagnifyingGlass
                    size={14}
                    weight="bold"
                    className="text-[#E32C19]"
                  />
                  Browse categories
                </Link>
                <Link
                  href="/reports"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#3F4147] bg-[#313338] px-4 py-2.5 text-sm font-medium text-[#DBDEE1] transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
                >
                  <FileText
                    size={14}
                    weight="bold"
                    className="text-[#E32C19]"
                  />
                  Reports
                </Link>
              </nav>
              <Link
                href="/register"
                className="mt-10 inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
              >
                Create your free Media Kit
                <ArrowRight size={16} weight="bold" />
              </Link>
            </div>
          </div>
        </section>

        {/* Disclaimer footer */}
        <section className="border-b border-[#3F4147]">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <p className="text-xs leading-relaxed text-[#6D7079]">
              {SITE_NAME} is an independent analytics product. Platform names
              are trademarks of their respective owners; we are not endorsed by
              or affiliated with Twitch, YouTube, TikTok, Instagram, X, or Kick
              — we integrate where their APIs and policies allow.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
