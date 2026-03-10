export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* TODO: implement sidebar nav */}
      <aside className="w-64 border-r border-border bg-surface p-4">
        <span className="text-lg font-bold text-primary">TwitchMetrics</span>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
