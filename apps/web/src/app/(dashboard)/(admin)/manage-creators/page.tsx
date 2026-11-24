import type { Metadata } from "next";
import { CreatorManagement } from "@/components/admin";

export const metadata: Metadata = {
  title: "Manage Creators",
  robots: { index: false, follow: false },
};

export default function AdminCreatorsPage() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-4 px-5 py-10 sm:px-8 lg:px-10">
      <h1 className="text-3xl font-bold text-n-ink">Creator Management</h1>
      <CreatorManagement />
    </div>
  );
}
