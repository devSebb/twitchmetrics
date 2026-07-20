"use client";

import Image from "next/image";
import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-[#1E1F22]">
        <div className="hero-gradient absolute inset-0 opacity-40" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pt-24 pb-12 sm:px-6 sm:pt-32 lg:pt-40">
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight text-[#F2F3F5] sm:text-5xl lg:text-6xl">
            The media kit for creators
            <br />
            <span className="text-[#E32C19]">
              and the agencies behind them.
            </span>
          </h1>
          <p className="mt-6 text-xl font-medium text-[#DBDEE1] sm:text-2xl">
            One link. Send it anywhere.
          </p>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-relaxed text-[#949BA4] sm:text-lg">
            Your stats deserve more than scattered analytics and static
            screenshots. Get a verified, professional, and always-updating
            presence — whether you&apos;re building your own creator profile or
            managing a full agency roster.{" "}
            <span className="font-semibold text-[#DBDEE1]">For Free.</span>
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/register"
              className="inline-flex items-center rounded-lg bg-[#E32C19] px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-[#C72615] active:bg-[#B02010]"
            >
              Create Your Free Media Kit
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex items-center rounded-lg border border-[#3F4147] bg-[#2B2D31]/60 px-6 py-3 text-base font-medium text-[#DBDEE1] backdrop-blur transition-colors hover:bg-[#383A40]"
            >
              See how it works
            </Link>
          </div>
        </div>

        {/* Product preview */}
        <div className="relative mx-auto mt-14 max-w-3xl sm:mt-16">
          {/* Glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-4 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(227,44,25,0.25),transparent_60%)] blur-2xl"
          />
          <div className="relative overflow-hidden rounded-2xl border border-[#3F4147] bg-[#313338] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
            <Image
              src="/brand/TM_Creator_SS.png"
              alt="TwitchMetrics creator media kit — verified, multi-platform stats in one shareable profile."
              width={1600}
              height={1000}
              priority
              sizes="(min-width: 1024px) 768px, 100vw"
              className="h-auto w-full object-contain"
            />
          </div>
        </div>
      </div>

      {/* CSS gradient animation */}
      <style jsx>{`
        .hero-gradient {
          background:
            radial-gradient(
              ellipse 80% 50% at 50% 0%,
              rgba(227, 44, 25, 0.15) 0%,
              transparent 60%
            ),
            radial-gradient(
              ellipse 60% 40% at 30% 80%,
              rgba(145, 70, 255, 0.08) 0%,
              transparent 50%
            ),
            radial-gradient(
              ellipse 60% 40% at 70% 80%,
              rgba(227, 44, 25, 0.06) 0%,
              transparent 50%
            );
          animation: hero-shift 12s ease-in-out infinite alternate;
        }
        @keyframes hero-shift {
          0% {
            transform: translateY(0) scale(1);
          }
          100% {
            transform: translateY(-10px) scale(1.05);
          }
        }
      `}</style>
    </section>
  );
}
