import Link from "next/link";

export function CtaSection() {
  return (
    <section className="bg-[#1E1F22] py-20">
      <div className="mx-auto max-w-4xl px-6">
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-10 text-center sm:p-14">
          <h2 className="text-2xl font-bold text-[#F2F3F5] sm:text-3xl">
            Are you interested in digging deep into your creator analytics?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[#949BA4]">
            TwitchMetrics has all the tools and resources you need. All in one
            powerhouse for analytics.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="inline-flex items-center rounded-lg bg-[#E32C19] px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-[#C72615] active:bg-[#B02010]"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
