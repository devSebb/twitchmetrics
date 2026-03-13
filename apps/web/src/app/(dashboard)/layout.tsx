import { redirect } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { DashboardNavbar } from "@/components/dashboard";
import { Footer } from "@/components/layout/Footer";
import { auth } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!session.user.name) {
    redirect("/onboarding");
  }

  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      displayName: true,
      slug: true,
      avatarUrl: true,
      state: true,
    },
  });

  return (
    <div className="flex min-h-screen flex-col bg-[#2B2D31]">
      <DashboardNavbar
        user={{
          id: session.user.id,
          name: session.user.name,
          email: session.user.email ?? null,
          image: session.user.image ?? null,
          role: session.user.role,
        }}
        creatorProfile={creatorProfile}
      />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
