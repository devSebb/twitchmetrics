"use client";

import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-[#1E1F22]">
        <div className="hero-gradient absolute inset-0 opacity-40" />
      </div>

      <div className="relative mx-auto max-w-5xl px-6 py-24 text-center sm:py-32 lg:py-40">
        <h1 className="font-display text-4xl font-black leading-tight tracking-tight text-[#F2F3F5] sm:text-5xl lg:text-6xl">
          Top Level Metrics for Streaming.
          <br />
          <span className="text-[#E32C19]">By Creators for Creators.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[#949BA4]">
          The all-in-one analytics platform for streamers. Track your growth,
          understand your audience, and make smarter content decisions — across
          every platform.
        </p>
        <div className="mt-10">
          <Link
            href="/register"
            className="inline-flex items-center rounded-lg bg-[#E32C19] px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-[#C72615] active:bg-[#B02010]"
          >
            Get Started
          </Link>
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
