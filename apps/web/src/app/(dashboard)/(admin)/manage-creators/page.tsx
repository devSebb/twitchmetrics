import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manage Creators",
  robots: { index: false, follow: false },
};

export default function AdminCreatorsPage() {
  // TODO: implement creator management
  return (
    <div>
      <h1 className="text-3xl font-bold">Creator Management</h1>
    </div>
  );
}
