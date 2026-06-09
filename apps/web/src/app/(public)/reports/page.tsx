import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  GameController,
  ChartLineUp,
  Trophy,
  ChartPieSlice,
  GearSix,
  Lightning,
  ShieldCheck,
  Sparkle,
  CheckCircle,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/Card";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { ReportLeadForm } from "@/components/reports";

export const metadata: Metadata = {
  title: "Reports",
  description:
    "Access in-depth streaming analytics reports. Game performance data, creator insights, and market analysis powered by Stream Hatchet.",
  openGraph: {
    title: `Reports | ${SITE_NAME}`,
    description:
      "In-depth streaming analytics reports — game performance, creator insights, and market analysis.",
    type: "website",
    url: `${SITE_URL}/reports`,
  },
  twitter: {
    card: "summary",
    site: TWITTER_HANDLE,
    title: `Reports | ${SITE_NAME}`,
  },
  alternates: { canonical: `${SITE_URL}/reports` },
};

// Real report categories — metrics map to what the configurator actually
// produces (see lib/constants/report-templates.ts). No gated/blurred previews:
// these reports are paid products, so we show what's inside rather than
// pretending to hide it.
const REPORT_TYPES = [
  {
    icon: GameController,
    tag: "Games",
    title: "Top Games",
    description:
      "The most-watched games across streaming platforms — viewer trends, peak hours, and channel counts.",
    metrics: ["Hours watched", "Avg viewers", "Peak viewers", "Top channels"],
  },
  {
    icon: ChartLineUp,
    tag: "Creators",
    title: "Creator Growth",
    description:
      "Cross-platform performance for the channels you care about — viewership, momentum, and audience makeup.",
    metrics: [
      "Avg viewers",
      "Peak viewers",
      "Audience by country",
      "Gender split",
    ],
  },
  {
    icon: Trophy,
    tag: "Esports",
    title: "Esports Viewership",
    description:
      "Tournament and title viewership — peak concurrents, hours watched, and how interest trends over time.",
    metrics: ["Peak concurrent", "Hours watched", "Avg viewers"],
  },
  {
    icon: ChartPieSlice,
    tag: "Market",
    title: "Platform Market Share",
    description:
      "How Twitch, YouTube, and Kick stack up — share of viewership, unique audience, and shifting trends.",
    metrics: ["Share of viewership", "Unique viewers", "Trend over time"],
  },
] as const;

const STEPS = [
  {
    icon: GearSix,
    title: "Configure it",
    body: "Pick games or channels, the metrics that matter, platforms, and timeframe.",
  },
  {
    icon: Lightning,
    title: "Buy or get a quote",
    body: "Standard combinations download instantly. Anything custom is quoted within 24 hours.",
  },
  {
    icon: ShieldCheck,
    title: "Trust the numbers",
    body: "Every figure is backed by Stream Hatchet — trusted by publishers and global brands.",
  },
] as const;

const TRUST_POINTS = [
  "Cross-platform viewership data",
  "Peak hours and audience overlap",
  "Competitor benchmarking",
  "Monthly trend analysis",
] as const;

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="mb-16">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#3F4147] bg-[#313338]/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#DBDEE1]">
          <Sparkle size={14} weight="fill" className="text-[#E32C19]" />
          Reports
        </p>
        <h1 className="font-display mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-[#F2F3F5] sm:text-5xl">
          Industry-grade streaming reports,{" "}
          <span className="text-[#E32C19]">on demand.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#DBDEE1]">
          Choose your games or channels, the metrics that matter, and the
          timeframe. Standard reports download instantly — anything custom is
          quoted within 24 hours.
        </p>
        <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#949BA4]">
          <span>Powered by Stream Hatchet</span>
          <span className="text-[#3F4147]">·</span>
          <span>
            Standard reports from{" "}
            <span className="font-semibold text-[#F2F3F5]">$250</span>
          </span>
        </p>
      </div>

      {/* ── What you can report on ───────────────────────────────────────── */}
      <section className="mb-16">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
            What you can report on
          </p>
          <h2 className="font-display mt-2 text-2xl font-bold tracking-tight text-[#F2F3F5] sm:text-3xl">
            Built for the questions brands and agencies ask
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {REPORT_TYPES.map(
            ({ icon: Icon, tag, title, description, metrics }) => (
              <Card key={title} className="flex flex-col gap-4 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#E32C19]/10 text-[#E32C19]">
                    <Icon size={22} weight="duotone" />
                  </div>
                  <span className="rounded bg-[#383A40] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#949BA4]">
                    {tag}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#F2F3F5]">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#949BA4]">
                    {description}
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {metrics.map((m) => (
                    <span
                      key={m}
                      className="rounded-md border border-[#3F4147] bg-[#2B2D31] px-2 py-1 text-[11px] font-medium text-[#DBDEE1]"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </Card>
            ),
          )}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="mb-16">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
            How it works
          </p>
          <h2 className="font-display mt-2 text-2xl font-bold tracking-tight text-[#F2F3F5] sm:text-3xl">
            From question to report in three steps
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div
              key={title}
              className="rounded-lg border border-[#3F4147] bg-[#313338] p-5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E32C19] text-xs font-bold text-white">
                  {i + 1}
                </span>
                <Icon size={20} weight="duotone" className="text-[#E32C19]" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-[#F2F3F5]">
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#949BA4]">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trust band + build-your-report CTA ───────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Stream Hatchet credibility band */}
        <Card className="flex flex-col p-6">
          <Image
            src="/brand/streamhatchet.png"
            alt="Stream Hatchet"
            width={200}
            height={56}
            className="h-9 w-auto object-contain object-left"
          />
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
            Verified data
          </p>
          <h3 className="font-display mt-2 text-xl font-bold text-[#F2F3F5]">
            Backed by Stream Hatchet
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#949BA4]">
            Every report is built on Stream Hatchet&apos;s cross-platform
            dataset — the same source trusted by gaming publishers and global
            brands.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[#DBDEE1]">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <CheckCircle
                  size={18}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-[#22c55e]"
                />
                {point}
              </li>
            ))}
          </ul>
          <Link
            href="https://streamhatchet.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-[#383A40] px-6 py-3 text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
          >
            Learn more on Stream Hatchet
            <ArrowRight size={16} weight="bold" />
          </Link>
        </Card>

        {/* Lead form — gateway to the configurator (data flow unchanged) */}
        <Card className="flex flex-col p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E32C19]">
            Start here
          </p>
          <h3 className="font-display mt-2 text-xl font-bold text-[#F2F3F5]">
            Build your report
          </h3>
          <p className="mb-6 mt-2 text-sm leading-relaxed text-[#949BA4]">
            Tell us who you are, then configure exactly what you need on the
            next step — instant download or a custom quote.
          </p>
          <ReportLeadForm />
        </Card>
      </section>
    </div>
  );
}
