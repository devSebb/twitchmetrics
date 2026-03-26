import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { SecuritySettings } from "@/components/settings/SecuritySettings";
import { getSession } from "@/server/auth-cache";

export const metadata: Metadata = {
  title: "Security Settings",
  robots: { index: false, follow: false },
};

export default async function SecurityPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });

  return <SecuritySettings hasPassword={Boolean(user?.passwordHash)} />;
}
