import type { Metadata } from "next";
import Link from "next/link";
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

const SAMPLE_REPORTS = [
  {
    title: "Weekly Top Games Report",
    description:
      "Most-watched games across all streaming platforms with viewer trends, peak hours, and channel counts.",
    tag: "Weekly",
  },
  {
    title: "Creator Growth Analysis",
    description:
      "Cross-platform follower growth, engagement rates, and audience demographics for top creators.",
    tag: "Monthly",
  },
  {
    title: "Esports Viewership Insights",
    description:
      "Tournament viewership data, peak concurrent viewers, and year-over-year growth for major esports titles.",
    tag: "Quarterly",
  },
  {
    title: "Platform Market Share Report",
    description:
      "Streaming platform comparison — Twitch vs YouTube vs Kick market share trends and unique viewer data.",
    tag: "Monthly",
  },
] as const;

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#F2F3F5]">
          Streaming Analytics Reports
        </h1>
        <p className="mt-2 max-w-2xl text-[#949BA4]">
          Get real data. Automate the effort to analyze the market. Our reports
          cover game performance, creator growth, and platform trends.
        </p>
      </div>

      {/* Sample reports (blurred previews) */}
      <div className="mb-10">
        <h2 className="mb-4 text-lg font-bold text-[#F2F3F5]">
          Sample Reports
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {SAMPLE_REPORTS.map((report) => (
            <div
              key={report.title}
              className="group relative overflow-hidden rounded-lg border border-[#3F4147] bg-[#313338]"
            >
              {/* Blurred content preview */}
              <div className="px-5 pb-16 pt-5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-[#E32C19]/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-[#E32C19]">
                    {report.tag}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-[#F2F3F5]">
                  {report.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#949BA4]">
                  {report.description}
                </p>

                {/* Fake chart lines (blurred) */}
                <div className="mt-4 space-y-2 blur-sm">
                  <div className="h-2 w-full rounded bg-[#E32C19]/30" />
                  <div className="h-2 w-4/5 rounded bg-[#9146ff]/30" />
                  <div className="h-2 w-3/5 rounded bg-[#22c55e]/30" />
                  <div className="h-2 w-2/5 rounded bg-[#3b82f6]/30" />
                </div>
              </div>

              {/* Locked overlay */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-[#1E1F22] via-[#1E1F22]/90 to-transparent px-5 pb-4 pt-12">
                <span className="text-xs font-medium text-[#949BA4]">
                  Sign up to unlock full report
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Report + Stream Hatchet CTA */}
      <div className="mb-10 grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col justify-between p-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded bg-[#E32C19]/20 px-2.5 py-1 text-xs font-semibold text-[#E32C19]">
                Premium
              </span>
            </div>
            <h3 className="text-xl font-bold text-[#F2F3F5]">
              Game Performance Report
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#949BA4]">
              Comprehensive game analytics powered by Stream Hatchet. Get
              detailed viewership breakdowns, audience engagement metrics,
              competitor analysis, and market positioning insights for any game.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-[#DBDEE1]">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[#22c55e]">&#10003;</span>
                Cross-platform viewership data
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[#22c55e]">&#10003;</span>
                Peak hours and audience overlap
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[#22c55e]">&#10003;</span>
                Competitor benchmarking
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[#22c55e]">&#10003;</span>
                Monthly trend analysis
              </li>
            </ul>
          </div>
          <Link
            href="https://streamhatchet.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#383A40] px-6 py-3 text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
          >
            Learn More on Stream Hatchet
            <svg
              className="ml-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </Link>
        </Card>

        {/* Lead gen form */}
        <Card className="p-6">
          <h3 className="text-xl font-bold text-[#F2F3F5]">
            Request a Custom Report
          </h3>
          <p className="mt-2 mb-6 text-sm text-[#949BA4]">
            Tell us about your needs and we&apos;ll prepare a tailored analytics
            report for your team.
          </p>
          <ReportLeadForm />
        </Card>
      </div>
    </div>
  );
}
