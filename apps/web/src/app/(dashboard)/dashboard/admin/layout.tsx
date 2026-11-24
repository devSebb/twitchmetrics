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

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-8 lg:px-10">
      {children}
    </div>
  );
}
