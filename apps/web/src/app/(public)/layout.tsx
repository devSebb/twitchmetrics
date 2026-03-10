export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {/* TODO: implement navbar */}
      <nav className="border-b border-border px-6 py-4">
        <span className="text-lg font-bold text-primary">TwitchMetrics</span>
      </nav>
      <main>{children}</main>
      {/* TODO: implement footer */}
      <footer className="border-t border-border px-6 py-8 text-text-muted">
        <p>&copy; TwitchMetrics</p>
      </footer>
    </>
  )
}
