import { ConnectionsGrid } from "@/components/connections";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connections",
  robots: { index: false, follow: false },
};

export default function ConnectionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#F2F3F5]">
          Connected Platforms
        </h1>
        <p className="mt-2 text-sm text-[#949BA4]">
          Connect your platform accounts to sync private analytics, enable
          claims, and keep your profile data fresh.
        </p>
      </div>

      <ConnectionsGrid callbackPath="/dashboard/connections" />
    </div>
  );
}
