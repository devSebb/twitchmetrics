import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Roster",
  robots: { index: false, follow: false },
};

export default function RosterPage() {
  // TODO: implement talent manager roster grid
  return (
    <div>
      <h1 className="text-3xl font-bold">Creator Roster</h1>
    </div>
  );
}
