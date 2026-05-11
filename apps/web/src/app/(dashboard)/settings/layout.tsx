import { SettingsTabNav } from "@/components/settings/SettingsTabNav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-3xl font-bold text-[#F2F3F5]">Settings</h1>
        <p className="mt-2 text-sm text-[#949BA4]">
          Manage your profile, password, and account preferences.
        </p>
      </div>
      <SettingsTabNav />
      {children}
    </div>
  );
}
