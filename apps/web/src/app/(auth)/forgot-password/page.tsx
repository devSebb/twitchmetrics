import Link from "next/link";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth";

export const metadata: Metadata = {
  title: "Forgot Password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-lg">
      <Link
        href="/login"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-n-slate transition-colors hover:text-n-ink"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back
      </Link>

      <div className="text-left">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.16em] text-n-slate">
            Account Recovery
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-n-ink">
            Reset Password
          </h1>
          <p className="text-sm text-n-slate">
            Get a secure link for your Noticed account
          </p>
        </div>

        <div className="mt-6">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
