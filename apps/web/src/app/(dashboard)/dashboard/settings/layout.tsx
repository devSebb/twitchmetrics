import { SettingsTabNav } from "@/components/settings/SettingsTabNav";

export default function DashboardSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="noticed n-workspace mx-auto w-full max-w-[1280px] space-y-8 px-5 py-10 sm:px-8 lg:px-10">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-n-ink">
          Settings
        </h1>
        <p className="mt-2 text-sm text-n-slate">
          Manage your profile, password, and account preferences.
        </p>
      </div>
      <SettingsTabNav />
      {children}
    </div>
  );
}
