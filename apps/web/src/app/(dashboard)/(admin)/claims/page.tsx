import { ClaimReviewQueue } from "@/components/admin";

export default function AdminClaimsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-[#F2F3F5]">Claim Review Queue</h1>
      <ClaimReviewQueue />
    </div>
  );
}
