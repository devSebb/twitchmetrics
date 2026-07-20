import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ChartLineUp,
  ShieldCheck,
  Export,
  ArrowRight,
  ArrowSquareOut,
  Sparkle,
  Lightning,
} from "@phosphor-icons/react/dist/ssr";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";

export const metadata: Metadata = {
  title: "For Talent Managers — Verified rosters. Faster pitches.",
  description:
    "The only roster dashboard with verified data. Onboard creators, centralize stats across every platform, and pitch brands with data they already trust — for free.",
  openGraph: {
    title: `For Talent Managers | ${SITE_NAME}`,
    description:
      "Verified rosters, multi-platform stats, and pitch-ready exports in one dashboard.",
    type: "website",
    url: `${SITE_URL}/solutions/talent-managers`,
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    title: `For Talent Managers | ${SITE_NAME}`,
  },
  alternates: { canonical: `${SITE_URL}/solutions/talent-managers` },
};

const FEATURES = [
  {
    icon: ChartLineUp,
    title: "Your full roster, one dashboard",
    body: "Track every creator across Twitch, YouTube, TikTok, Instagram, X, and Kick. Compare performance side-by-side. Filter by game, audience, or growth — and surface your strongest pitches in seconds.",
  },
  {
    icon: ShieldCheck,
    title: "Verified data brands trust",
    body: "Metrics are automatically refreshed from Stream Hatchet — the same data engine gaming publishers and brands already use. Start closing pitches with data-led stats.",
  },
  {
    icon: Export,
    title: "Pitch-ready exports",
    body: "Generate branded reports and shareable roster links in one click. Always updating and ready to share with brands, agencies, or publishers — no design work or manual updates.",
  },
] as const;

const STEPS = [
  {
    title: "Add your roster",
    body: "Invite creators or add their channels directly (Twitch, YouTube, TikTok, Instagram, X, Kick). No back-and-forth, no spreadsheets.",
  },
  {
    title: "Verified data, automatically",
    body: "Every creator's stats are automatically refreshed from Stream Hatchet — the same data engine publishers and brands already trust.",
  },
  {
    title: "Manage from one dashboard",
    body: "Filter by game, platform, audience size, or growth. Compare creators side-by-side. Spot your strongest pitches instantly.",
  },
  {
    title: "Pitch and export",
    body: "Share verified profiles with brands or export custom reports. Verified data, instantly accessible.",
  },
] as const;

const FAQS = [
  {
    question: "Is the Roster Dashboard really free?",
    answer:
      "Yes. Onboard creators, centralize stats, and export pitch-ready reports for free. No card, no design work, no setup fees.",
  },
  {
    question: "Are there limits on how many creators I can add?",
    answer:
      "No limits. Bring your entire roster — small agency or full talent network — into one dashboard.",
  },
  {
    question: "How do I add creators to my roster?",
    answer:
      "Invite creators by email or add their channels directly across Twitch, YouTube, TikTok, Instagram, X, and Kick. Channels are recognized automatically and matched to verified data.",
  },
  {
    question:
      "Do creators need to approve being added, or can I add them directly?",
    answer:
      "You can add channels directly to your roster to start managing and pitching immediately. Creators can claim and verify their profile at any time to unlock first-party analytics.",
  },
  {
    question: "Can I manage creators who only stream on one platform?",
    answer:
      "Yes. The dashboard adapts to whatever platforms each creator is active on — single-platform or multi-platform.",
  },
  {
    question: "How long does it take to onboard a full roster?",
    answer:
      "Minutes per creator. Add a channel, and verified stats start flowing immediately — no manual data entry, no spreadsheets.",
  },
  {
    question: 'What does "verified" mean — and why should brands trust it?',
    answer:
      "Metrics are automatically refreshed from Stream Hatchet, the same data engine gaming publishers, brands, and agencies already use to source talent. The numbers come from the same source brands already use on their side.",
  },
  {
    question: "How often is creator data refreshed?",
    answer:
      "On a scheduled cadence based on profile priority and the data available from each platform. Profiles show when their latest snapshot was updated.",
  },
  {
    question: "Can I export reports in custom formats (PDF, CSV, branded)?",
    answer:
      "Yes. Generate PDF media kits, CSV exports, or shareable roster links — all from one dashboard in a single click.",
  },
  {
    question: "Can I export reports with my agency's branding?",
    answer:
      "Yes. Branded exports let you put your agency front and center on every pitch — a deal-closing feature out of the box.",
  },
  {
    question: "Can multiple team members access the dashboard?",
    answer:
      "Yes. Invite teammates to collaborate on your roster, share pitches, and manage creators together.",
  },
] as const;

export default function TalentManagersSolutionsPage() {
  return (
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
              For Talent Managers
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Still sending screenshots{" "}
              <span className="text-[#E32C19]">to brands?</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#DBDEE1]">
              Imagine having every creator and every platform in one verified
              dashboard. Always updating. Always pitch-ready. For free.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
              >
                Build your free verified roster
                <ArrowRight size={16} weight="bold" />
              </Link>
              <Link
                href="#how-it-works"
                className="rounded-lg border border-[#3F4147] bg-[#313338] px-5 py-3 text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#383A40]"
              >
                See how it works
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Verified rosters, faster pitches */}
      <section className="border-b border-[#3F4147]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
                Verified rosters. Faster pitches.
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                Pitch brands with data they already trust.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#DBDEE1]">
                Onboard your creators, centralize their stats, and pitch brands
                with data they already trust — all in one dashboard.
              </p>
            </div>
            <ul className="space-y-5">
              {[
                {
                  title: "Close deals faster",
                  body: "Access verified stats, not self-reported numbers. Metrics refresh automatically from Stream Hatchet, so you can pitch brands with data from a source they already trust.",
                },
                {
                  title: "One dashboard, full visibility",
                  body: "Every creator and platform in one always-updating view. Filter, compare, and surface your top talent quickly.",
                },
                {
                  title: "Reports that win pitches",
                  body: "Export the latest available data in one click. No design work and no manual updates.",
                },
              ].map((item) => (
                <li
                  key={item.title}
                  className="rounded-xl border border-[#3F4147] bg-[#313338] p-5"
                >
                  <p className="text-base font-semibold text-[#F2F3F5]">
                    {item.title}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#DBDEE1]">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Centralized Roster */}
      <section className="border-b border-[#3F4147] bg-[#2B2D31]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
              Your centralized roster
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Manage talent. Prove value. Close brand deals.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#DBDEE1]">
              Everything you need — without spreadsheets, screenshots, or
              back-and-forth.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-[#3F4147] bg-[#313338] p-6 transition-colors hover:border-[#E32C19]/60"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#E32C19]/15 text-[#E32C19]">
                    <Icon size={22} weight="bold" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[#F2F3F5]">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#DBDEE1]">
                    {feature.body}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-12 flex justify-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
            >
              Onboard your roster for free
              <ArrowRight size={16} weight="bold" />
            </Link>
          </div>
        </div>
      </section>

      {/* Built for agencies */}
      <section className="border-b border-[#3F4147]">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
          <div className="overflow-hidden rounded-3xl border border-[#3F4147] bg-gradient-to-br from-[#313338] via-[#2B2D31] to-[#1E1F22] p-10 sm:p-14">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
              Built for agencies
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Every creator, every platform, in one place.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#DBDEE1]">
              Talent managers and agencies use TwitchMetrics to onboard creators
              in minutes, prove creator value with verified data, and close
              deals faster.
            </p>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
            >
              Centralize your roster for free
              <ArrowRight size={16} weight="bold" />
            </Link>
          </div>
        </div>
      </section>

      {/* Skip the spreadsheets */}
      <section className="border-b border-[#3F4147] bg-[#2B2D31]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
                Skip the spreadsheets
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                Close faster.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#DBDEE1]">
                Stop juggling different tools and losing hours to manual updates
                and outdated numbers. Get every creator, every platform, every
                metric in one verified and automatically updated dashboard — and
                send pitch-ready reports in minutes.
              </p>
              <Link
                href="/register"
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
              >
                Build your pitch-ready roster
                <ArrowRight size={16} weight="bold" />
              </Link>
            </div>
            <div className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-4 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(227,44,25,0.2),transparent_60%)] blur-2xl"
              />
              <div className="relative overflow-hidden rounded-2xl border border-[#3F4147] bg-[#313338] shadow-2xl shadow-black/40">
                <Image
                  src="/brand/TM_Manager_SS.png"
                  alt="TwitchMetrics talent manager dashboard — every creator, every platform, in one verified roster."
                  width={1600}
                  height={1000}
                  sizes="(min-width: 1024px) 480px, 100vw"
                  className="h-auto w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Smart content decisions */}
      <section className="border-b border-[#3F4147]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#E32C19]/15 text-[#E32C19]">
                <Lightning size={22} weight="bold" />
              </div>
              <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                Make smarter content decisions.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-[#DBDEE1]">
                Discover what&apos;s trending. Browse top channels and games and
                understand what audiences are watching in the latest data.
              </p>
              <p className="mt-4 max-w-xl text-base font-semibold text-[#F2F3F5]">
                Need more data? Discover our instant reports.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/browse"
                  className="rounded-lg border border-[#3F4147] bg-[#313338] px-5 py-3 text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#383A40]"
                >
                  Browse trending
                </Link>
                <Link
                  href="/reports"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
                >
                  See instant reports
                  <ArrowRight size={16} weight="bold" />
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Trending games", value: "30+" },
                { label: "Tracked creators", value: "10K+" },
                { label: "Platforms", value: "6" },
                { label: "Refresh", value: "Automatic" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-[#3F4147] bg-[#313338] p-5"
                >
                  <p className="text-xs uppercase tracking-wider text-[#949BA4]">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="border-b border-[#3F4147] bg-[#2B2D31]"
      >
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              From spreadsheet to pitch-ready in four steps.
            </h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="relative rounded-2xl border border-[#3F4147] bg-[#313338] p-6"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
                  Step {index + 1}
                </p>
                <h3 className="mt-3 text-lg font-semibold text-[#F2F3F5]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#DBDEE1]">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-[#3F4147]">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
            FAQs
          </p>
          <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Questions, answered.
          </h2>
          <div className="mt-10">
            <FaqAccordion items={FAQS} />
          </div>
        </div>
      </section>

      {/* Final CTA — Stream Hatchet upsell */}
      <section>
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
          <div className="overflow-hidden rounded-3xl border border-[#3F4147] bg-gradient-to-br from-[#313338] via-[#2B2D31] to-[#1E1F22] p-10 text-center sm:p-14">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
              Need more firepower?
            </p>
            <div className="mt-5 flex justify-center">
              <Image
                src="/brand/streamhatchet.png"
                alt="Stream Hatchet"
                width={240}
                height={64}
                className="h-12 w-auto object-contain sm:h-14"
              />
            </div>
            <h2 className="mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Upgrade to enterprise-grade analytics.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-[#DBDEE1]">
              TwitchMetrics is powered by{" "}
              <span className="font-semibold text-[#F2F3F5]">
                Stream Hatchet
              </span>
              , the leading streaming intelligence platform trusted by gaming
              publishers, brands, and agencies. If your team needs deeper
              business analytics — full-market trend reports, campaign
              attribution, sponsorship benchmarking, custom data feeds — Stream
              Hatchet has it.
            </p>
            <Link
              href="https://streamhatchet.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
            >
              Explore Stream Hatchet
              <ArrowSquareOut size={16} weight="bold" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
