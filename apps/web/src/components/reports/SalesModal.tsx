"use client";

import type { ComplexityFlag } from "@/lib/constants/report-templates";

type Props = {
  open: boolean;
  onClose: () => void;
  flags: ComplexityFlag[];
  score: number;
  name: string;
  email: string;
  company: string;
};

export function SalesModal({
  open,
  onClose,
  flags,
  score,
  name,
  email,
  company,
}: Props) {
  if (!open) return null;

  const isComplex = score >= 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md rounded-2xl border border-[#3F4147] bg-[#2B2D31] p-8">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded p-1 text-[#4E5058] hover:text-[#DBDEE1]"
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Icon */}
        <div
          className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${isComplex ? "bg-[#E32C19]/10" : "bg-[#5865F2]/10"}`}
        >
          {isComplex ? (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#E32C19"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          ) : (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#5865F2"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          )}
        </div>

        <h2 className="mb-1 text-lg font-bold text-[#F2F3F5]">
          {isComplex ? "Custom Enterprise Report" : "Talk to Our Team"}
        </h2>
        <p className="mb-5 text-sm text-[#949BA4]">
          {isComplex
            ? "This report configuration requires a custom quote from our data team. We'll scope it and get back to you within 1 business day."
            : "This configuration isn't available as an instant download yet, but our team can turn it around quickly for you."}
        </p>

        {flags.length > 0 && (
          <div className="mb-5 rounded-lg border border-[#3F4147] bg-[#313338] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#949BA4]">
              Why this goes to sales
            </p>
            <ul className="space-y-1">
              {flags.map((f) => (
                <li
                  key={f.label}
                  className="flex items-center gap-2 text-xs text-[#DBDEE1]"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#E32C19]" />
                  {f.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <a
          href={`mailto:reports@twitchmetrics.com?subject=Custom%20Report%20Request&body=Hi%2C%20I%E2%80%99d%20like%20to%20request%20a%20custom%20report.%0A%0AName%3A%20${encodeURIComponent(name)}%0AEmail%3A%20${encodeURIComponent(email)}%0ACompany%3A%20${encodeURIComponent(company)}`}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#E32C19] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
        >
          Contact Sales
        </a>
        <p className="mt-3 text-center text-xs text-[#4E5058]">
          Response within 1 business day · Custom pricing
        </p>
      </div>
    </div>
  );
}
