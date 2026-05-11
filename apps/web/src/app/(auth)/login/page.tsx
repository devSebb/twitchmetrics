import Link from "next/link";
import Image from "next/image";
import { LoginForm, SocialLoginButtons } from "@/components/auth";
import { getConfiguredSocialLoginProviders } from "@/lib/oauth-providers";

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
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-[#949BA4]">
            Welcome
          </p>
          <div className="relative mx-auto flex justify-center">
            <Image
              src="/brand/logo.png"
              alt="TwitchMetrics"
              width={220}
              height={59}
              className="h-14 w-auto object-contain"
            />
          </div>
          <p className="text-sm text-[#949BA4]">Log in to continue</p>
        </div>

        <div className="mt-6">
          <SocialLoginButtons
            callbackUrl={callbackUrl}
            enabledProviders={socialProviders}
            mode="login"
          />
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#3F4147]" />
          <span className="text-xs uppercase tracking-wide text-[#949BA4]">
            or
          </span>
          <div className="h-px flex-1 bg-[#3F4147]" />
        </div>

        <LoginForm callbackUrl={callbackUrl} />

        {errorMessage && (
          <p className="mt-4 text-sm text-[#f87171]">{errorMessage}</p>
        )}

        <p className="mt-6 text-sm text-[#949BA4]">
          Don&apos;t have an account?{" "}
          <Link href={registerHref} className="text-[#DBDEE1] hover:text-white">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
