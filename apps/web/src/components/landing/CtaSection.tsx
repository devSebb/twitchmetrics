import Link from "next/link";

export function CtaSection() {
  return (
    <section className="relative overflow-hidden bg-[#1E1F22] py-20 sm:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 100%, rgba(227,44,25,0.18) 0%, transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-4xl px-6">
        <div className="relative overflow-hidden rounded-2xl border border-[#3F4147] bg-[#313338] p-10 text-center sm:p-16">
          <h2 className="font-display text-3xl font-bold tracking-tight text-[#F2F3F5] sm:text-4xl lg:text-5xl">
            Your stats deserve better{" "}
            <span className="text-[#E32C19]">than a PDF.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#949BA4] sm:text-lg">
            Whether you&apos;re one creator or managing a hundred — get
            verified, live, and brand-ready.{" "}
            <span className="font-semibold text-[#DBDEE1]">For Free.</span>
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/register?role=creator"
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#E32C19] px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-[#C72615] active:bg-[#B02010] sm:w-auto"
            >
              I&apos;m a Creator
            </Link>
            <Link
              href="/register?role=talent_manager"
              className="inline-flex w-full items-center justify-center rounded-lg border border-[#3F4147] bg-[#1E1F22] px-8 py-3 text-base font-semibold text-[#F2F3F5] transition-colors hover:bg-[#383A40] sm:w-auto"
            >
              I&apos;m a Talent Agency
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
