import type { Metadata } from "next";
import { SystemMetrics } from "@/components/admin";

export const metadata: Metadata = {
  title: "System Metrics",
  robots: { index: false, follow: false },
};

export default function AdminMetricsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-[#F2F3F5]">System Metrics</h1>
      <SystemMetrics />
    </div>
  );
}
