import { ConnectionsGrid } from "@/components/connections";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connections",
  robots: { index: false, follow: false },
};

export default function ConnectionsPage() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-n-ink">
          Connected Platforms
        </h1>
        <p className="mt-2 text-sm text-n-slate">
          Connect your platform accounts to sync private analytics, enable
          claims, and keep your profile data fresh.
        </p>
      </div>

      <ConnectionsGrid callbackPath="/dashboard/connections" />
    </div>
  );
}
