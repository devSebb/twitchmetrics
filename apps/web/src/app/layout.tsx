import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import "./globals.css";

const gotham = localFont({
  src: [
    {
      path: "./fonts/gotham-rounded-light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "./fonts/gotham-rounded-light-italic.otf",
      weight: "300",
      style: "italic",
    },
    { path: "./fonts/gotham-rounded-book.otf", weight: "400", style: "normal" },
    {
      path: "./fonts/gotham-rounded-book-italic.otf",
      weight: "400",
      style: "italic",
    },
    {
      path: "./fonts/gotham-rounded-medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/gotham-rounded-medium-italic.otf",
      weight: "500",
      style: "italic",
    },
    { path: "./fonts/gotham-rounded-bold.otf", weight: "700", style: "normal" },
    {
      path: "./fonts/gotham-rounded-bold-italic.otf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-gotham",
  display: "swap",
});

const gothamBlack = localFont({
  src: [{ path: "./fonts/Gotham-Ultra.otf", weight: "900", style: "normal" }],
  variable: "--font-gotham-black",
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
        className={`${gotham.variable} ${gothamBlack.variable} font-body bg-background text-text-primary antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
