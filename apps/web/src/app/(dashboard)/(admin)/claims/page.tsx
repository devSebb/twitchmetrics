import { ClaimReviewQueue } from "@/components/admin";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Claim Review Queue",
  robots: { index: false, follow: false },
};

export default function AdminClaimsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-[#F2F3F5]">Claim Review Queue</h1>
      <ClaimReviewQueue />
    </div>
  );
}
