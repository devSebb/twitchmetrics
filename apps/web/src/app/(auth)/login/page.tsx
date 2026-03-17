import Link from "next/link";
import Image from "next/image";
import { LoginMethodSwitcher, SocialLoginButtons } from "@/components/auth";

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
    case "Verification":
      return "Magic link verification failed or expired.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackUrl = getSafeReturnTo(params.returnTo ?? params.callbackUrl);
  const registerHref = `/register?returnTo=${encodeURIComponent(callbackUrl)}`;
  const errorMessage = getAuthErrorMessage(params.error);

  return (
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
        <SocialLoginButtons callbackUrl={callbackUrl} mode="login" />
      </div>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[#3F4147]" />
        <span className="text-xs uppercase tracking-wide text-[#949BA4]">
          or
        </span>
        <div className="h-px flex-1 bg-[#3F4147]" />
      </div>

      <LoginMethodSwitcher callbackUrl={callbackUrl} />

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
  );
}
