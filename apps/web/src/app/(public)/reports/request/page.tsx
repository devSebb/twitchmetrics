import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SITE_URL } from "@/lib/constants/seo";
import { ReportRequestForm } from "@/components/reports/ReportRequestForm";
import { IndustryInquiryCTA } from "@/components/reports/IndustryInquiryCTA";

export const metadata: Metadata = {
  title: "Performance Report",
  description:
    "Tailor your perfect report on creators, games, and the overall industry.",
  robots: { index: false, follow: false },
  alternates: { canonical: `${SITE_URL}/reports/request` },
};

type PageProps = {
  searchParams: Promise<{ name?: string; email?: string; company?: string }>;
};

export default async function ReportRequestPage({ searchParams }: PageProps) {
  const { name, email, company } = await searchParams;

  if (!name || !email || !company) {
    redirect("/reports");
  }

  return (
    <div className="n-form mx-auto max-w-[1280px] px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
      {/* Back link */}
      <Link
        href="/reports"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-n-slate transition-colors hover:text-n-ink"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to Reports
      </Link>

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-[clamp(2.5rem,5vw,4.5rem)] font-extrabold tracking-tight text-n-ink">
          Performance report
        </h1>
        <p className="mt-3 max-w-2xl text-base text-n-ink">
          Choose your subjects, platforms, metrics and timeframe. Standard
          combinations are available as instant CSV reports; custom requests
          receive a quote from our team.
        </p>
      </div>

      {/* Form */}
      <ReportRequestForm name={name} email={email} company={company} />

      {/* Custom industry-data inquiry CTA */}
      <IndustryInquiryCTA name={name} email={email} company={company} />
    </div>
  );
}
