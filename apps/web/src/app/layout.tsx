import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Providers } from "./providers"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "TwitchMetrics | Creator Analytics Platform",
  description:
    "Unified creator analytics dashboard, media kit builder, and cross-platform growth tracking.",
  openGraph: {
    title: "TwitchMetrics | Creator Analytics Platform",
    description:
      "Unified creator analytics dashboard, media kit builder, and cross-platform growth tracking.",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#0a0a0a] text-white antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
