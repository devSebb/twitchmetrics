import { redirect } from "next/navigation";
import { Footer, Header } from "@/components/layout";
import { getSession } from "@/server/auth-cache";
import { WorkspaceShell } from "@/components/dashboard/WorkspaceShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!session.user.hasCompletedOnboarding) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#2B2D31]">
      <Header />
      <WorkspaceShell role={session.user.role}>{children}</WorkspaceShell>
      <Footer />
    </div>
  );
}
