import { AppearanceProvider } from "@/components/ui/Appearance";
export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppearanceProvider>
      <div className="noticed n-workspace min-h-[60vh]">{children}</div>
    </AppearanceProvider>
  );
}
