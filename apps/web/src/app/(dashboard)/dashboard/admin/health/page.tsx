import type { Metadata } from "next";
import { SystemHealth } from "@/components/admin";

export const metadata: Metadata = {
  title: "System Health",
  robots: { index: false, follow: false },
};

export default function AdminHealthPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-[#F2F3F5]">System Health</h1>
      <SystemHealth />
    </div>
  );
}
