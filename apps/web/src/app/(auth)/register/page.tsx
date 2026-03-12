import Link from "next/link";
import { RegisterForm, SocialLoginButtons } from "@/components/auth";

type RegisterPageProps = {
  searchParams: Promise<{
    returnTo?: string;
    callbackUrl?: string;
  }>;
};

function getSafeReturnTo(value?: string): string {
  if (!value || !value.startsWith("/")) {
    return "/home";
  }
  return value;
}

export default async function RegisterPage({
  searchParams,
}: RegisterPageProps) {
  const params = await searchParams;
  const callbackUrl = getSafeReturnTo(params.returnTo ?? params.callbackUrl);
  const loginHref = `/login?returnTo=${encodeURIComponent(callbackUrl)}`;

  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-8 text-center shadow-xl">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.16em] text-[#949BA4]">
          Get started
        </p>
        <h1 className="text-3xl font-bold text-[#F2F3F5]">Create Account</h1>
        <p className="text-sm text-[#949BA4]">Join TwitchMetrics in seconds</p>
      </div>

      <div className="mt-6">
        <SocialLoginButtons callbackUrl={callbackUrl} mode="register" />
      </div>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[#3F4147]" />
        <span className="text-xs uppercase tracking-wide text-[#949BA4]">
          or
        </span>
        <div className="h-px flex-1 bg-[#3F4147]" />
      </div>

      <RegisterForm callbackUrl={callbackUrl} />

      <p className="mt-6 text-sm text-[#949BA4]">
        Already have an account?{" "}
        <Link href={loginHref} className="text-[#DBDEE1] hover:text-white">
          Log in
        </Link>
      </p>
    </div>
  );
}
