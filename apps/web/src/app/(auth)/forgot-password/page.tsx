import Link from "next/link";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth";

export const metadata: Metadata = {
  title: "Forgot Password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <Link
        href="/login"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
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

      <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-8 text-center shadow-xl">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.16em] text-[#949BA4]">
            Account Recovery
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#F2F3F5]">
            Reset Password
          </h1>
          <p className="text-sm text-[#949BA4]">
            Get a secure link for your TwitchMetrics account
          </p>
        </div>

        <div className="mt-6">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
