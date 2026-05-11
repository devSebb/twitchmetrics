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

  return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</div>;
}
