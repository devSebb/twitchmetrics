"use client";

import Link from "next/link";
import { Container } from "@/components/ui/Editorial";

export default function CreatorPageError({ reset }: { reset: () => void }) {
  return (
    <div className="noticed min-h-[60vh]">
      <Container className="py-16 sm:py-24">
        <p className="n-eyebrow mb-4 text-n-slate">Temporarily unavailable</p>
        <h1 className="text-3xl font-bold tracking-tight">
          We couldn’t load this page.
        </h1>
        <p role="alert" className="mt-4 max-w-xl text-n-slate">
          Please try again. Your current selection will stay in the address bar.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className="n-button n-button-primary"
            onClick={reset}
          >
            Try again
          </button>
          <Link href="/creators" className="n-button n-button-secondary">
            Explore channels
          </Link>
        </div>
      </Container>
    </div>
  );
}
