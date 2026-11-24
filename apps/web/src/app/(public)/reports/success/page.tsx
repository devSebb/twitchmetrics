import { Suspense } from "react";
import type { Metadata } from "next";
import { ReportSuccessContent } from "./ReportSuccessContent";

export const metadata: Metadata = {
  title: "Report Ready",
  robots: { index: false, follow: false },
};

export default function ReportSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-n-line border-t-n-red" />
        </div>
      }
    >
      <ReportSuccessContent />
    </Suspense>
  );
}
