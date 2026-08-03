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
import { REPORT_METRIC_LABELS as METRIC } from "@/lib/constants/metric-labels";
import { ReportLeadForm } from "@/components/reports";

export const metadata: Metadata = {
  title: "Reports",
  description:
    "Streaming analytics reports as instant CSV downloads — top Twitch games and channel performance — plus custom esports and market-share reports quoted within 24 hours.",
  openGraph: {
    title: `Reports | ${SITE_NAME}`,
    description:
      "Instant Twitch game and channel reports as CSV, plus custom esports and market-share reports quoted within 24 hours.",
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

// Real report categories — every card states exactly what its fulfillment
// path delivers. "instant" cards mirror the green templates in
// lib/constants/report-templates.ts and the columns report-generator.ts
// actually writes; "quote" cards are scoped and built manually by the
// Stream Hatchet team, so their copy promises a brief, not a download.
const FULFILLMENT_BADGES = {
  instant: {
    label: "Instant CSV · $250",
    className: "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]",
  },
  quote: {
    label: "Custom quote · 24h",
    className: "border-[#3F4147] bg-[#383A40] text-[#DBDEE1]",
  },
} as const;

const REPORT_TYPES = [
  {
    icon: GameController,
    tag: "Games",
    fulfillment: "instant",
    title: "Top Games on Twitch",
    description:
      "The most-watched games on Twitch over the last 30 or 90 days — or your own hand-picked list — ranked by hours watched, with data-quality coverage flagged on every row.",
    metrics: [
      METRIC.hoursWatched,
      METRIC.avgViewers,
      METRIC.peakViewers,
      METRIC.topCreators,
    ],
  },
  {
    icon: ChartLineUp,
    tag: "Channels",
    fulfillment: "instant",
    title: "Twitch Channel Performance",
    description:
      "Top Twitch channels or your own shortlist — followers, average and peak live viewership, plus each channel's gender and country where available.",
    metrics: [
      "Followers",
      METRIC.avgViewers,
      METRIC.peakViewers,
      METRIC.gender,
      METRIC.country,
    ],
  },
  {
    icon: Trophy,
    tag: "Esports",
    fulfillment: "quote",
    title: "Esports Viewership",
    description:
      "Tournament and event viewership built to your brief on Stream Hatchet's dataset — peak concurrents, hours watched, and how interest trends across a season. Scoped and quoted by our team within 24 hours.",
    metrics: [METRIC.peakViewers, METRIC.hoursWatched, "Trend Over Time"],
  },
  {
    icon: ChartPieSlice,
    tag: "Market",
    fulfillment: "quote",
    title: "Platform Market Share",
    description:
      "How Twitch, YouTube, and Kick split live-streaming viewership — share of hours watched and shifts over time. Custom-built from Stream Hatchet's cross-platform data and quoted within 24 hours.",
    metrics: ["Share of Viewership", METRIC.hoursWatched, "Trend Over Time"],
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
    body: "Twitch-standard combinations download instantly as CSV. Anything custom is quoted within 24 hours.",
  },
  {
    icon: ShieldCheck,
    title: "Trust the numbers",
    body: "Instant reports are computed from TwitchMetrics' own 30-minute snapshot pipeline with per-row coverage flags; custom reports are built on Stream Hatchet data.",
  },
] as const;

const TRUST_POINTS = [
  "Transparent methodology in every CSV",
  "Per-row data-quality flags on instant reports",
  "Cross-platform data for custom reports",
  "Custom quotes within 24 hours",
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
          Pick games or channels, the metrics you need, and a timeframe.
          Standard Twitch reports download instantly as CSV — cross-platform and
          custom asks are quoted within 24 hours.
        </p>
        <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#949BA4]">
          <span>Custom reports powered by Stream Hatchet</span>
          <span className="text-[#3F4147]">·</span>
          <span>
            Instant reports{" "}
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
            ({ icon: Icon, tag, fulfillment, title, description, metrics }) => (
              <Card key={title} className="flex flex-col gap-4 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#E32C19]/10 text-[#E32C19]">
                    <Icon size={22} weight="duotone" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#383A40] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#949BA4]">
                      {tag}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${FULFILLMENT_BADGES[fulfillment].className}`}
                    >
                      {FULFILLMENT_BADGES[fulfillment].label}
                    </span>
                  </div>
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
            Custom and cross-platform reports are built on Stream Hatchet&apos;s
            dataset — the same source trusted by gaming publishers and global
            brands. Instant Twitch reports come from TwitchMetrics&apos; own
            snapshot pipeline, with the methodology printed in every file.
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
