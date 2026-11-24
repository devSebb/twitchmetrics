import {
  Container,
  SectionHeading,
  ActionLink,
} from "@/components/ui/Editorial";
import type { Metadata } from "next";

import {
  SITE_URL,
  SITE_NAME,
  TWITTER_HANDLE,
  DEFAULT_OG_IMAGE,
} from "@/lib/constants/seo";

const PAGE_PATH = "/about";
const CANONICAL = `${SITE_URL}${PAGE_PATH}`;

const PAGE_DESCRIPTION =
  "Noticed brings creator profiles, shareable media kits and talent-manager workspaces together, with public metrics and connected insights across supported platforms. Powered by Hatchet.";

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
    title: "The numbers, in context",
    body: "Explore followers, viewers and growth across tracked channels. Reporting periods, freshness and source notes help explain the figures.",
  },
  {
    title: "Public discovery & creator profiles",
    body: "Browse top channels and games, search the directory, and open shareable creator pages. Creators get found. Brands and agencies source talent.",
  },
  {
    title: "Dashboards & media kits",
    body: "Claim your profile, connect supported accounts and share a focused media kit alongside your full analytics profile. Managers can review the roster and insights their creators approve.",
  },
] as const;

const AUDIENCES = [
  {
    title: "Creators",
    body: "Create your free profile, connect supported accounts and share a media kit that brings your channels, audience and work together.",
    href: "/solutions/creators",
    cta: "Read more for creators",
  },
  {
    title: "Talent managers & agencies",
    body: "Invite the creators you represent, follow accepted-roster performance and export the data available to you. Creator approval and permissions determine private access.",
    href: "/solutions/talent-managers",
    cta: "Read more for agencies",
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <AboutJsonLd />
      <header className="border-b border-n-line bg-n-surface">
        <Container className="py-16 sm:py-24">
          <p className="n-eyebrow text-n-slate">About Noticed</p>
          <h1 className="mt-6 max-w-4xl text-[clamp(3rem,7vw,6rem)] font-extrabold leading-[.98] tracking-[-.055em]">
            Good work deserves to be seen<span className="text-n-red">.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-n-slate">
            A place for creators to tell their story, and for the people behind
            them to understand their audience. Public profiles, detailed
            analytics and shareable media kits, powered by Hatchet.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ActionLink href="/register">
              Create your free creator profile
            </ActionLink>
            <ActionLink variant="secondary" href="#how-it-helps">
              Explore Noticed ↓
            </ActionLink>
          </div>
        </Container>
      </header>
      <Container className="py-16 sm:py-20">
        <SectionHeading number="01" title="A clearer picture of your work." />
        <div className="grid gap-8 text-lg leading-relaxed text-n-slate md:grid-cols-2">
          <p>
            Your channels tell different parts of the same story. Noticed brings
            Twitch, YouTube, TikTok, Instagram, X and Kick together where data
            is available, so people can explore the audience behind your work.
          </p>
          <p>
            Profiles begin with public information. Claiming gives you control
            over your profile, and supported account connections add private
            insights. Collection schedules and coverage vary; source and
            freshness notes stay beside the numbers.
          </p>
        </div>
      </Container>
      <section
        id="how-it-helps"
        className="border-y border-n-line bg-n-surface"
      >
        <Container className="py-16 sm:py-20">
          <SectionHeading number="02" title="From discovery to sharing." />
          <div className="grid gap-10 md:grid-cols-3">
            {PILLARS.map((pillar) => (
              <article
                key={pillar.title}
                className="border-t border-n-line pt-6"
              >
                <h3 className="text-2xl font-bold tracking-tight">
                  {pillar.title}
                </h3>
                <p className="mt-4 leading-relaxed text-n-slate">
                  {pillar.body}
                </p>
              </article>
            ))}
          </div>
        </Container>
      </section>
      <Container className="py-16 sm:py-20">
        <SectionHeading number="03" title="For talent. And its team." />
        <div className="grid gap-12 md:grid-cols-2">
          {AUDIENCES.map((audience) => (
            <article
              key={audience.title}
              className="border-t border-n-line pt-6"
            >
              <h3 className="text-3xl font-bold tracking-tight">
                {audience.title}
              </h3>
              <p className="mt-4 mb-6 max-w-xl leading-relaxed text-n-slate">
                {audience.body}
              </p>
              <ActionLink variant="secondary" href={audience.href}>
                {audience.cta} ↗
              </ActionLink>
            </article>
          ))}
        </div>
      </Container>
      <section className="n-dark bg-n-ink text-white">
        <Container className="py-16">
          <h2 className="text-4xl font-extrabold tracking-tight">
            Find your next perspective.
          </h2>
          <nav
            aria-label="Explore Noticed"
            className="mt-8 flex flex-wrap gap-3"
          >
            <ActionLink variant="light" href="/creators">
              Explore channels ↗
            </ActionLink>
            <ActionLink variant="light" href="/browse">
              Browse categories ↗
            </ActionLink>
            <ActionLink variant="light" href="/reports">
              Explore reports ↗
            </ActionLink>
          </nav>
        </Container>
      </section>
      <Container className="py-8">
        <p className="max-w-4xl text-xs leading-relaxed text-n-slate">
          {SITE_NAME} is an independent analytics product. Platform names are
          trademarks of their respective owners; we are not endorsed by or
          affiliated with Twitch, YouTube, TikTok, Instagram, X or Kick.
          Integrations depend on their APIs and policies.
        </p>
      </Container>
    </>
  );
}
