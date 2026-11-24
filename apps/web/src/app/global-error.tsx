"use client";

import * as Sentry from "@sentry/nextjs";
import { NOTICED_CSS_VARS } from "@/lib/constants/noticed";
import { Wordmark } from "@/components/brand/Wordmark";
import "./globals.css";
import "./noticed.css";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={NOTICED_CSS_VARS}
        className="noticed flex min-h-screen items-center justify-center"
      >
        <main className="mx-auto max-w-xl px-5 py-16">
          <Wordmark />
          <h1 className="mt-12 text-4xl font-extrabold tracking-tight">
            Something went wrong
          </h1>
          <p className="mt-4 text-sm text-n-slate">
            An unexpected error occurred. The error has been reported
            automatically.
          </p>
          <button
            type="button"
            onClick={reset}
            className="n-button n-button-primary mt-6"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
