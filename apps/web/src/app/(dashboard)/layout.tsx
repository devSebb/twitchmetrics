import { redirect } from "next/navigation";
import { Footer, Header } from "@/components/layout";
import { getSession } from "@/server/auth-cache";

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
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
