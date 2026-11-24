"use client";

import Link from "next/link";
import { Container } from "@/components/ui/Editorial";

export function CategoryPageLoading() {
  return (
    <div className="noticed min-h-[70vh]" aria-busy="true">
      <Container className="py-16">
        <p role="status" className="n-eyebrow text-n-slate">
          Loading category information…
        </p>
        <div aria-hidden="true" className="mt-8 animate-pulse space-y-8">
          <div className="h-16 w-3/4 max-w-xl rounded bg-n-surface" />
          <div className="h-6 w-1/2 rounded bg-n-surface" />
          <div className="h-72 border-y border-n-line bg-n-surface/50" />
        </div>
      </Container>
    </div>
  );
}
export function CategoryPageError({ reset }: { reset: () => void }) {
  return (
    <div className="noticed min-h-[60vh]">
      <Container className="py-16 sm:py-24">
        <p className="n-eyebrow mb-4 text-n-slate">Temporarily unavailable</p>
        <h1 className="text-3xl font-bold tracking-tight">
          We couldn’t load this category page.
        </h1>
        <p role="alert" className="mt-4 max-w-xl text-n-slate">
          Please try again. Your current selection will stay in the address bar.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="n-button n-button-primary"
          >
            Try again
          </button>
          <Link href="/browse" className="n-button n-button-secondary">
            Explore categories
          </Link>
        </div>
      </Container>
    </div>
  );
}
