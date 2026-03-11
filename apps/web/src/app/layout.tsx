import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// Fallback font until Gotham .woff2 files are placed in src/app/fonts/.
// Once fonts are available, replace with:
//   import localFont from "next/font/local"
//   const gotham = localFont({
//     src: [
//       { path: "./fonts/GothamLight.woff2", weight: "300", style: "normal" },
//       { path: "./fonts/GothamBook.woff2", weight: "400", style: "normal" },
//       { path: "./fonts/GothamMedium.woff2", weight: "500", style: "normal" },
//       { path: "./fonts/GothamBold.woff2", weight: "700", style: "normal" },
//     ],
//     variable: "--font-gotham",
//     display: "swap",
//   })
//   const gothamBlack = localFont({
//     src: [{ path: "./fonts/GothamBlack.woff2", weight: "900", style: "normal" }],
//     variable: "--font-gotham-black",
//     display: "swap",
//   })
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-gotham",
  display: "swap",
});

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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} font-body bg-background text-text-primary antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
