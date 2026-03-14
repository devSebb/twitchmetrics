import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ManagerDashboard } from "@/components/manager/ManagerDashboard";

export const metadata: Metadata = {
  title: "Talent Manager Dashboard",
  robots: { index: false, follow: false },
};

export default async function RosterPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "talent_manager") redirect("/dashboard");

  return <ManagerDashboard userId={session.user.id} />;
}
