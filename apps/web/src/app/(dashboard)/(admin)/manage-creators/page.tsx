import type { Metadata } from "next";
import { CreatorManagement } from "@/components/admin";

export const metadata: Metadata = {
  title: "Manage Creators",
  robots: { index: false, follow: false },
};

export default function AdminCreatorsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <h1 className="text-3xl font-bold text-[#F2F3F5]">Creator Management</h1>
      <CreatorManagement />
    </div>
  );
}
