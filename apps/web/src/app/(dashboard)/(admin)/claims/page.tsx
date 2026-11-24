import { ClaimReviewQueue } from "@/components/admin";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Claim Review Queue",
  robots: { index: false, follow: false },
};

export default function AdminClaimsPage() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-4 px-5 py-10 sm:px-8 lg:px-10">
      <h1 className="text-3xl font-bold text-n-ink">Claim Review Queue</h1>
      <ClaimReviewQueue />
    </div>
  );
}
