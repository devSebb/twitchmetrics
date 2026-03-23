import { redirect } from "next/navigation";
import { getSession } from "@/server/auth-cache";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session?.user?.role !== "admin") {
    redirect("/dashboard/home");
  }

  return <>{children}</>;
}
