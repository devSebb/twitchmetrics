import { notFound } from "next/navigation";
import { DesignSpecimen } from "@/components/design/DesignSpecimen";

export const metadata = {
  title: "Noticed design specimen",
  robots: { index: false, follow: false },
};

export default function DesignSystemPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DesignSpecimen />;
}
