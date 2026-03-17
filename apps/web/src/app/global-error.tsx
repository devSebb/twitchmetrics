"use client";

import * as Sentry from "@sentry/nextjs";
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
    <html lang="en" className="dark">
      <body className="flex min-h-screen items-center justify-center bg-[#2B2D31] font-sans text-[#F2F3F5]">
        <div className="mx-auto max-w-md px-4 text-center">
          <h1 className="text-4xl font-bold">Something went wrong</h1>
          <p className="mt-4 text-sm text-[#949BA4]">
            An unexpected error occurred. The error has been reported
            automatically.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-lg bg-[#E32C19] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#C72615]"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
