import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm, SocialLoginButtons } from "@/components/auth";
import { getConfiguredSocialLoginProviders } from "@/lib/oauth-providers";

export const metadata: Metadata = {
  title: "Log In",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams: Promise<{
    returnTo?: string;
    callbackUrl?: string;
    error?: string;
  }>;
};

function getSafeReturnTo(value?: string): string {
  if (!value || !value.startsWith("/")) {
    return "/dashboard/home";
  }
  return value;
}

function getAuthErrorMessage(error?: string): string | null {
  if (!error) return null;

  switch (error) {
    case "OAuthAccountNotLinked":
      return "This email is already linked to another sign-in method.";
    case "AccessDenied":
      return "Access was denied by the provider.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackUrl = getSafeReturnTo(params.returnTo ?? params.callbackUrl);
  const registerHref = `/register?returnTo=${encodeURIComponent(callbackUrl)}`;
  const errorMessage = getAuthErrorMessage(params.error);
  const socialProviders = getConfiguredSocialLoginProviders();

  return (
    <div className="w-full max-w-lg">
      {/* Back button */}
      <Link
        href="/"
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
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-n-slate">
            Welcome
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight">
            Welcome back<span className="text-n-red">.</span>
          </h1>
          <p className="text-sm text-n-slate">Log in to continue</p>
        </div>

        <div className="mt-6">
          <SocialLoginButtons
            callbackUrl={callbackUrl}
            enabledProviders={socialProviders}
            mode="login"
          />
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-n-line" />
          <span className="text-xs uppercase tracking-wide text-n-slate">
            or
          </span>
          <div className="h-px flex-1 bg-n-line" />
        </div>

        <LoginForm callbackUrl={callbackUrl} />

        {errorMessage && (
          <p className="mt-4 text-sm text-n-error">{errorMessage}</p>
        )}

        <p className="mt-6 text-sm text-n-slate">
          Don&apos;t have an account?{" "}
          <Link href={registerHref} className="text-n-ink hover:text-n-ink">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
