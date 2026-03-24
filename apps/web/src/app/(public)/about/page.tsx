import type { Metadata } from "next";
import Link from "next/link";
import {
  SITE_URL,
  SITE_NAME,
  TWITTER_HANDLE,
  DEFAULT_OG_IMAGE,
} from "@/lib/constants/seo";
import { Card } from "@/components/ui/Card";

const PAGE_PATH = "/about";
const CANONICAL = `${SITE_URL}${PAGE_PATH}`;

const PAGE_DESCRIPTION =
  "TwitchMetrics is a creator analytics platform for Twitch, YouTube, Instagram, TikTok, X, and Kick. Discover channels, track growth, build media kits, and measure streaming performance in one place.";

export const metadata: Metadata = {
  title: "About Us",
  description: PAGE_DESCRIPTION,
  keywords: [
    "creator analytics",
    "streamer analytics",
    "Twitch metrics",
    "YouTube creator stats",
    "cross-platform social media analytics",
    "media kit",
    "streaming growth",
    "creator discovery",
  ],
  openGraph: {
    title: `About ${SITE_NAME} | Creator Analytics Platform`,
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

const AUDIENCES = [
  {
    title: "Creators",
    body: "See your reach, growth, and performance across platforms in one dashboard. Claim your profile, connect accounts, and share a polished public page with sponsors and fans.",
  },
  {
    title: "Talent managers & teams",
    body: "Monitor a roster of creators, compare momentum, and export the numbers you need for planning and reporting — without juggling a dozen native analytics tabs.",
  },
  {
    title: "Brands & partners",
    body: "Discover creators, review public metrics, and evaluate fit before you reach out. Transparent stats help both sides align on expectations.",
  },
] as const;

const PILLARS = [
  {
    title: "Unified metrics",
    body: "Followers, viewers, engagement signals, and growth trends are normalized from each platform’s APIs so you can compare apples to apples where it makes sense.",
  },
  {
    title: "Public profiles & discovery",
    body: "Browse top channels and games, search the directory, and open shareable creator pages that highlight who someone is and how their audience is moving.",
  },
  {
    title: "Dashboards & media kits",
    body: "Authenticated users get deeper tooling: personal analytics, roster views for managers, and media kit generation built from live data — not static PDFs you forget to update.",
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <AboutJsonLd />
      <article className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-[#E32C19]">
            About {SITE_NAME}
          </p>
          <h1 className="mt-3 font-display text-3xl font-black tracking-tight text-[#F2F3F5] sm:text-4xl lg:text-5xl">
            Top-level metrics for streaming and social video
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-[#949BA4]">
            {SITE_NAME} is the creator analytics platform built for people who
            live on camera — streamers, short-form creators, and teams who need
            one honest view of growth across{" "}
            <span className="text-[#DBDEE1]">
              Twitch, YouTube, Instagram, TikTok, X, and Kick
            </span>
            .
          </p>
        </header>

        <section
          className="mt-14 border-t border-[#3F4147] pt-14"
          aria-labelledby="about-mission"
        >
          <h2
            id="about-mission"
            className="text-2xl font-bold text-[#F2F3F5] sm:text-3xl"
          >
            What we are building
          </h2>
          <p className="mt-4 max-w-3xl text-[#949BA4] leading-relaxed">
            Most creators do not lack data — they lack a single place that
            respects how they actually work. We combine public discovery (who is
            growing, what is trending) with private dashboards and media-ready
            exports so you can plan content, pitch partners, and prove impact
            without spreadsheet archaeology.
          </p>
          <p className="mt-4 max-w-3xl text-[#949BA4] leading-relaxed">
            Profiles can start from public API data and later be claimed and
            enriched when you connect your accounts, so the same surface works
            for cold discovery and for creators who want full control.
          </p>
        </section>

        <section
          className="mt-14 border-t border-[#3F4147] pt-14"
          aria-labelledby="about-pillars"
        >
          <h2
            id="about-pillars"
            className="text-2xl font-bold text-[#F2F3F5] sm:text-3xl"
          >
            How {SITE_NAME} helps
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {PILLARS.map((item) => (
              <li key={item.title}>
                <Card className="h-full border-[#3F4147] bg-[#313338] p-5">
                  <h3 className="text-base font-semibold text-[#F2F3F5]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#949BA4]">
                    {item.body}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="mt-14 border-t border-[#3F4147] pt-14"
          aria-labelledby="about-audiences"
        >
          <h2
            id="about-audiences"
            className="text-2xl font-bold text-[#F2F3F5] sm:text-3xl"
          >
            Who it is for
          </h2>
          <ul className="mt-8 space-y-6">
            {AUDIENCES.map((item) => (
              <li
                key={item.title}
                className="rounded-xl border border-[#3F4147] bg-[#1E1F22] p-6 sm:p-8"
              >
                <h3 className="text-lg font-semibold text-[#F2F3F5]">
                  {item.title}
                </h3>
                <p className="mt-2 text-[#949BA4] leading-relaxed">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="mt-14 border-t border-[#3F4147] pt-14"
          aria-labelledby="about-explore"
        >
          <h2
            id="about-explore"
            className="text-2xl font-bold text-[#F2F3F5] sm:text-3xl"
          >
            Explore the product
          </h2>
          <p className="mt-4 max-w-2xl text-[#949BA4] leading-relaxed">
            Jump into live directory data and reports — the same surfaces we use
            to power discovery and trends across the site.
          </p>
          <nav
            className="mt-8 flex flex-wrap gap-3"
            aria-label="Key product areas"
          >
            <Link
              href="/creators"
              className="rounded-lg border border-[#3F4147] bg-[#313338] px-4 py-2.5 text-sm font-medium text-[#DBDEE1] transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
            >
              Top creators
            </Link>
            <Link
              href="/games"
              className="rounded-lg border border-[#3F4147] bg-[#313338] px-4 py-2.5 text-sm font-medium text-[#DBDEE1] transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
            >
              Games & categories
            </Link>
            <Link
              href="/reports"
              className="rounded-lg border border-[#3F4147] bg-[#313338] px-4 py-2.5 text-sm font-medium text-[#DBDEE1] transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
            >
              Reports
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
            >
              Get started
            </Link>
          </nav>
        </section>

        <footer className="mt-16 rounded-xl border border-[#3F4147] bg-[#1E1F22] p-6 sm:p-8">
          <p className="text-sm text-[#949BA4] leading-relaxed">
            {SITE_NAME} is an independent analytics product. Platform names are
            trademarks of their respective owners; we are not endorsed by or
            affiliated with Twitch, YouTube, or other networks — we integrate
            where their APIs and policies allow.
          </p>
        </footer>
      </article>
    </>
  );
}
