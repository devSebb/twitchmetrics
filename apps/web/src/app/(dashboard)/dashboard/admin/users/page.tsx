import type { Metadata } from "next";
import { UserManagement } from "@/components/admin";

export const metadata: Metadata = {
  title: "User Management",
  robots: { index: false, follow: false },
};

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-n-ink">User Management</h1>
      <UserManagement />
    </div>
  );
}
