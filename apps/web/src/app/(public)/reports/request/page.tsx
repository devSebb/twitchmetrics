import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/constants/seo";
import { ReportRequestForm } from "@/components/reports/ReportRequestForm";

export const metadata: Metadata = {
  title: `Performance Report | ${SITE_NAME}`,
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
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {/* Back link */}
      <Link
        href="/reports"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
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
        <h1 className="text-4xl font-bold text-[#F2F3F5]">
          Performance report
        </h1>
        <p className="mt-3 max-w-2xl text-base text-[#DBDEE1]">
          Tailor your perfect report on creators, games, and the overall
          industry. Fill out the form and our team will reach out with the quote
          for your professional industry report.
        </p>
      </div>

      {/* Form */}
      <ReportRequestForm name={name} email={email} company={company} />
    </div>
  );
}
