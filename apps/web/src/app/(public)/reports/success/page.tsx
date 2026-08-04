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
        <div className="flex min-h-screen items-center justify-center bg-[#1E1F22]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#3F4147] border-t-[#E32C19]" />
        </div>
      }
    >
      <ReportSuccessContent />
    </Suspense>
  );
}
