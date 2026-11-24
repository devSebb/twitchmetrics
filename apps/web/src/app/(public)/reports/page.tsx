import type { Metadata } from "next";
import {
  GameController,
  ChartLineUp,
  Trophy,
  ChartPieSlice,
  GearSix,
  Lightning,
  ShieldCheck,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import {
  Container,
  SectionHeading,
  ActionLink,
} from "@/components/ui/Editorial";
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
    className: "border-n-success/30 bg-n-success/10 text-n-success",
  },
  quote: {
    label: "Custom quote · 24h",
    className: "border-n-line bg-n-surface text-n-ink",
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
    body: "Instant reports are computed from Noticed's snapshot history with per-row coverage flags; custom reports are built on Stream Hatchet data.",
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
    <div className="n-form">
      <header className="border-b border-n-line bg-n-surface">
        <Container className="py-16 sm:py-24">
          <p className="n-eyebrow text-n-slate">
            Reports / Streaming intelligence
          </p>
          <h1 className="mt-6 max-w-4xl text-[clamp(3rem,7vw,6rem)] font-extrabold leading-[.98] tracking-[-.055em]">
            Your questions.
            <br />
            Backed by data<span className="text-n-red">.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-n-slate">
            Pick games or channels, the metrics you need and a timeframe.
            Standard Twitch reports download as CSV. Cross-platform and custom
            requests receive a quote within 24 hours.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <ActionLink href="#build-report">Build your report ↓</ActionLink>
            <p className="text-sm text-n-slate">
              Instant reports <strong className="text-n-ink">$250</strong> ·
              Custom reports by Stream Hatchet
            </p>
          </div>
        </Container>
      </header>
      <Container className="py-16 sm:py-20">
        <SectionHeading number="01" title="The right view for your question." />
        <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
          {REPORT_TYPES.map(
            ({ icon: Icon, tag, fulfillment, title, description, metrics }) => (
              <article key={title} className="border-t border-n-line pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="n-eyebrow flex items-center gap-2 text-n-slate">
                    <Icon size={20} aria-hidden />
                    {tag}
                  </p>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${FULFILLMENT_BADGES[fulfillment].className}`}
                  >
                    {FULFILLMENT_BADGES[fulfillment].label}
                  </span>
                </div>
                <h3 className="mt-6 text-3xl font-bold tracking-tight">
                  {title}
                </h3>
                <p className="mt-4 leading-relaxed text-n-slate">
                  {description}
                </p>
                <ul
                  className="mt-6 flex flex-wrap gap-2"
                  aria-label="Included metrics"
                >
                  {metrics.map((metric) => (
                    <li
                      key={metric}
                      className="rounded border border-n-line px-2.5 py-1.5 text-xs text-n-slate"
                    >
                      {metric}
                    </li>
                  ))}
                </ul>
              </article>
            ),
          )}
        </div>
      </Container>
      <section className="border-y border-n-line bg-n-surface">
        <Container className="py-16 sm:py-20">
          <SectionHeading number="02" title="From question to report." />
          <ol className="grid gap-10 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li key={title} className="border-t border-n-line pt-6">
                <div className="flex items-center justify-between text-n-red">
                  <span className="text-4xl font-extrabold">0{index + 1}</span>
                  <Icon size={24} aria-hidden />
                </div>
                <h3 className="mt-5 text-2xl font-bold">{title}</h3>
                <p className="mt-4 leading-relaxed text-n-slate">{body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>
      <section id="build-report">
        <Container className="grid gap-12 py-16 sm:py-20 lg:grid-cols-2">
          <div>
            <p className="n-eyebrow text-n-red">03 / Start with the question</p>
            <h2 className="mt-5 text-4xl font-extrabold tracking-tight">
              Build your report.
            </h2>
            <p className="mt-5 max-w-lg leading-relaxed text-n-slate">
              Tell us who you are, then configure your report on the next step.
              Instant reports use Noticed snapshot history with methodology in
              every file; custom reports use Stream Hatchet data.
            </p>
            <ul className="my-7 space-y-3">
              {TRUST_POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 text-sm text-n-slate"
                >
                  <CheckCircle
                    size={18}
                    className="shrink-0 text-n-success"
                    aria-hidden
                  />
                  {point}
                </li>
              ))}
            </ul>
            <ActionLink variant="secondary" href="https://streamhatchet.com">
              About Stream Hatchet ↗
            </ActionLink>
          </div>
          <div className="border-t border-n-line pt-7">
            <h3 className="mb-6 text-2xl font-bold">Your details</h3>
            <ReportLeadForm />
          </div>
        </Container>
      </section>
    </div>
  );
}
