import type { Metadata } from "next";
import Link from "next/link";
import {
  ChartLineUp,
  FileText,
  Handshake,
  ArrowRight,
  Sparkle,
  LinkSimple,
} from "@phosphor-icons/react/dist/ssr";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";

export const metadata: Metadata = {
  title: "For Creators — Get discovered by the brands looking for you",
  description:
    "Build a free creator profile and become discoverable inside the Stream Hatchet network — where gaming publishers, brands, and agencies already source talent.",
  openGraph: {
    title: `For Creators | ${SITE_NAME}`,
    description:
      "Free creator profile, free media kit, and discovery inside the network gaming brands already trust.",
    type: "website",
    url: `${SITE_URL}/solutions/creators`,
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    title: `For Creators | ${SITE_NAME}`,
  },
  alternates: { canonical: `${SITE_URL}/solutions/creators` },
};

const FEATURES = [
  {
    icon: ChartLineUp,
    title: "Show your full reach",
    body: "Every platform, one dashboard. Aggregate follower counts, viewer metrics, and growth trends from Twitch, YouTube, TikTok, Instagram, X and more.",
  },
  {
    icon: FileText,
    title: "Free media kit generation",
    body: "Auto-generate a professional media kit from your analytics. Share your always-up-to-date reach and engagement with potential sponsors instantly.",
  },
  {
    icon: Handshake,
    title: "Fully customizable",
    body: "You choose what to highlight. Showcase past collaborations and attract new brand deals. One link, send it anywhere.",
  },
] as const;

const STEPS = [
  {
    title: "Build your profile",
    body: "Connect your accounts (Twitch, YouTube, TikTok, Instagram, X, Kick, etc). We auto-generate your free media kit in minutes — automatically and always up-to-date.",
  },
  {
    title: "Go live in the network",
    body: "Your profile becomes searchable across the Stream Hatchet ecosystem of brands, publishers, and agencies.",
  },
  {
    title: "Get the call",
    body: "When opportunities match your niche, you're already on the list.",
  },
  {
    title: "Show your full reach",
    body: "Every platform, one dashboard. One link with your free media kit, always up-to-date and ready to share. Send it anywhere.",
  },
] as const;

const FAQS = [
  {
    question: "Can I join the network for free?",
    answer:
      "Yes. Your profile and media kit are free forever. No credit card, no design work, no setup fees.",
  },
  {
    question: "Is there a minimum follower count to join?",
    answer:
      "No minimum. Brands are looking for engaged, authentic creators in specific games and verticals — visibility, not raw size, is what gets you discovered.",
  },
  {
    question: "How do brands actually find me?",
    answer:
      "Your profile becomes searchable inside the Stream Hatchet ecosystem — the platform gaming publishers, brands, and agencies already use to source talent. When an opportunity matches your niche, you're already on the list.",
  },
  {
    question: "What kinds of brands and publishers are in the network?",
    answer:
      "Gaming publishers, endemic and non-endemic brands, and talent agencies that already source creators through Stream Hatchet for sponsorships and campaigns.",
  },
  {
    question: "Do I appear in searches automatically?",
    answer:
      "Yes. Once your profile is live and your accounts are connected, you're discoverable across the network — no extra steps required.",
  },
  {
    question: "Do I need to have an account on every platform?",
    answer:
      "No. Connect whichever platforms you stream and post on. The dashboard and media kit adapt to whatever you bring.",
  },
  {
    question: "Can I customize the content of my media kit?",
    answer:
      "Yes. You choose what to highlight — featured streams, past brand partnerships, audience demographics, top games, and more. One link, send it anywhere.",
  },
  {
    question: "How long does setup actually take?",
    answer:
      "Minutes. Connect your accounts and your media kit auto-generates from live data — no spreadsheets, no manual updates.",
  },
] as const;

export default function CreatorsSolutionsPage() {
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
              For Creators
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Get found by the brands{" "}
              <span className="text-[#E32C19]">looking for you.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#DBDEE1]">
              Build a free creator profile and become discoverable inside the
              Stream Hatchet network — where gaming publishers, brands, and
              agencies already source talent.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
              >
                Get discovered for free
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

      {/* Enter the network */}
      <section className="border-b border-[#3F4147]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
                Enter a network for creators
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                Talent isn&apos;t the problem. Visibility is.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#DBDEE1]">
                Build your presence today, get discovered now. Create your
                profile and get visible — for free.
              </p>
            </div>
            <ul className="space-y-5">
              {[
                {
                  title: "Show up where brands are looking",
                  body: "Your profile is visible inside Stream Hatchet — the platform gaming publishers and agencies use to source talent.",
                },
                {
                  title: "Stand out in your niche",
                  body: "Brands are looking for engaged, authentic creators in specific games and verticals. That's you.",
                },
                {
                  title: "A media kit that's ready when they are",
                  body: "When a brand reaches out, your kit is already done. One link. Live stats.",
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

      {/* One single tool */}
      <section className="border-b border-[#3F4147] bg-[#2B2D31]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
              One single tool
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Everything you need to manage your brand — without spreadsheets or
              guesswork.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#DBDEE1]">
              One simple tool. Infinite advantages.
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
              Enter the network for free
              <ArrowRight size={16} weight="bold" />
            </Link>
          </div>
        </div>
      </section>

      {/* Mid CTA — Be the creator brands find next */}
      <section className="border-b border-[#3F4147]">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
          <div className="overflow-hidden rounded-3xl border border-[#3F4147] bg-gradient-to-br from-[#313338] via-[#2B2D31] to-[#1E1F22] p-10 text-center sm:p-14">
            <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Be the creator brands find next.
            </h2>
            <p className="mt-4 text-base text-[#DBDEE1]">
              Free profile. Free network. Inside the gaming network brands
              already trust.
            </p>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
            >
              Get discovered for free
              <ArrowRight size={16} weight="bold" />
            </Link>
          </div>
        </div>
      </section>

      {/* One link */}
      <section className="border-b border-[#3F4147] bg-[#2B2D31]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
                Your free media kit
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                One link. Send it anywhere.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#DBDEE1]">
                Your stats deserve better than a PDF. Free forever. No card. No
                design work. Clean, professional, easy to trust — one link that
                does the work for you.
              </p>
              <Link
                href="/register"
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
              >
                Join the network — free
                <ArrowRight size={16} weight="bold" />
              </Link>
            </div>
            <div className="rounded-2xl border border-[#3F4147] bg-[#313338] p-6 shadow-2xl shadow-black/40">
              <div className="flex items-center gap-3 border-b border-[#3F4147] pb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E32C19]/20 text-[#E32C19]">
                  <LinkSimple size={22} weight="bold" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#F2F3F5]">
                    twitchmetrics.net/yourname
                  </p>
                  <p className="text-xs text-[#949BA4]">
                    Live stats · Always up to date
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: "Total reach", value: "1.2M" },
                  { label: "Avg viewers", value: "8.4K" },
                  { label: "Platforms", value: "5" },
                  { label: "Growth (90d)", value: "+18%" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-[#3F4147] bg-[#2B2D31] p-4"
                  >
                    <p className="text-xs uppercase tracking-wider text-[#949BA4]">
                      {stat.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-[#F2F3F5]">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-b border-[#3F4147]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              How discovery works.
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
      <section className="border-b border-[#3F4147] bg-[#2B2D31]">
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

      {/* Final CTA */}
      <section>
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
          <div className="overflow-hidden rounded-3xl border border-[#3F4147] bg-[#313338] p-10 text-center sm:p-14">
            <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Free profile. Free media kit. Free network.
            </h2>
            <p className="mt-4 text-base text-[#DBDEE1]">
              Set up in minutes. Get discovered today.
            </p>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#E32C19] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
            >
              Get discovered for free
              <ArrowRight size={16} weight="bold" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
