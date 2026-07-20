import Image from "next/image";
import {
  LinkSimple,
  Sparkle,
  ShareNetwork,
} from "@phosphor-icons/react/dist/ssr";

const STEPS = [
  {
    icon: LinkSimple,
    title: "Connect your platforms",
    body: "Twitch, YouTube, TikTok, Instagram, X, Kick. Link them once.",
  },
  {
    icon: Sparkle,
    title: "We auto-build your kit",
    body: "Verified stats, automatically refreshed from every platform. Zero manual work.",
  },
  {
    icon: ShareNetwork,
    title: "Share one link",
    body: "Send it to brands, agencies, and sponsors. Always updating.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-[#2B2D31] py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-[#F2F3F5] sm:text-4xl">
            Get brand-ready in 3 steps.
          </h2>
          <p className="mt-4 text-base text-[#949BA4] sm:text-lg">
            No design work. No spreadsheets. No screenshots.
          </p>
        </div>

        <div className="relative mt-14 grid gap-6 sm:grid-cols-3">
          {/* Connector line on desktop */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-12 right-12 top-7 hidden h-px bg-gradient-to-r from-transparent via-[#3F4147] to-transparent sm:block"
          />

          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div
              key={title}
              className="relative flex flex-col items-center text-center"
            >
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[#3F4147] bg-[#313338] text-[#E32C19]">
                <Icon size={26} weight="duotone" />
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#E32C19] text-[11px] font-bold text-white">
                  {i + 1}
                </span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-[#F2F3F5]">
                {title}
              </h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#949BA4]">
                {body}
              </p>
            </div>
          ))}
        </div>

        {/* Trust bar */}
        <div className="mt-20 rounded-xl border border-[#3F4147] bg-[#313338]/60 px-6 py-6 sm:px-10">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-8">
            <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#949BA4]">
              Powered by
            </p>
            <div className="flex items-center">
              <div className="relative h-12 w-36 sm:h-14 sm:w-44">
                <Image
                  src="/brand/streamhatchet.png"
                  alt="Stream Hatchet"
                  fill
                  className="object-contain"
                  sizes="(min-width: 640px) 176px, 144px"
                />
              </div>
            </div>
            <span aria-hidden className="hidden text-[#3F4147] sm:inline">
              ·
            </span>
            <p className="text-center text-sm text-[#949BA4] sm:text-left">
              The same data trusted by gaming publishers and global brands.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
