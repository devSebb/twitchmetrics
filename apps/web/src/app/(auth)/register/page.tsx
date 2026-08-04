import Link from "next/link";
import type { Metadata } from "next";
import { RegisterFlow } from "@/components/auth";
import { getConfiguredSocialLoginProviders } from "@/lib/oauth-providers";

export const metadata: Metadata = {
  title: "Create Account",
  robots: { index: false, follow: false },
};

type RegisterPageProps = {
  searchParams: Promise<{
    returnTo?: string;
    callbackUrl?: string;
  }>;
};

function getSafeReturnTo(value?: string): string {
  if (!value || !value.startsWith("/")) {
    return "/dashboard/home";
  }
  return value;
}

export default async function RegisterPage({
  searchParams,
}: RegisterPageProps) {
  const params = await searchParams;
  const callbackUrl = getSafeReturnTo(params.returnTo ?? params.callbackUrl);
  const loginHref = `/login?returnTo=${encodeURIComponent(callbackUrl)}`;
  const socialProviders = getConfiguredSocialLoginProviders();

  return (
    <div className="w-full max-w-md">
      {/* Back button */}
      <Link
        href="/"
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
            Get started
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#F2F3F5]">
            Create Account
          </h1>
          <p className="text-sm text-[#949BA4]">
            Join TwitchMetrics in seconds
          </p>
        </div>

        <div className="mt-6">
          <RegisterFlow
            callbackUrl={callbackUrl}
            socialProviders={socialProviders}
          />
        </div>

        <p className="mt-6 text-sm text-[#949BA4]">
          Already have an account?{" "}
          <Link href={loginHref} className="text-[#DBDEE1] hover:text-white">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
