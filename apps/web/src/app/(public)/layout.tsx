import Link from "next/link";
import { Footer } from "@/components/layout";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-[#3F4147] bg-[#1E1F22]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-bold text-[#F2F3F5]">
              TwitchMetrics
            </span>
          </Link>
          <div className="hidden items-center gap-6 sm:flex">
            <Link
              href="/creators"
              className="text-sm text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
            >
              Channels
            </Link>
            <Link
              href="/games"
              className="text-sm text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
            >
              Games
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md bg-[#E32C19] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#C72615]"
            >
              Login
            </Link>
          </div>
        </div>
      </nav>
      <main className="min-h-screen bg-[#2B2D31]">{children}</main>
      <Footer />
    </>
  );
}
