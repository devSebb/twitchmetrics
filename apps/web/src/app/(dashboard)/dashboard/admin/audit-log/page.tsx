import type { Metadata } from "next";
import { AuditLogViewer } from "@/components/admin";

export const metadata: Metadata = {
  title: "Audit Log",
  robots: { index: false, follow: false },
};

export default function AdminAuditLogPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-[#F2F3F5]">Audit Log</h1>
      <AuditLogViewer />
    </div>
  );
}
