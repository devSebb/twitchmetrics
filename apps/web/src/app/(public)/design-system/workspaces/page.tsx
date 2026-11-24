import { notFound } from "next/navigation";
import { WorkspaceSpecimen } from "@/components/design/WorkspaceSpecimen";
export const metadata = {
  title: "Workspace preview",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; drawer?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  return (
    <WorkspaceSpecimen
      initialView={params.view ?? "Roster"}
      initialDrawer={params.drawer === "1"}
    />
  );
}
