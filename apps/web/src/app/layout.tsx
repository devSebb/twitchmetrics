import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import {
  SITE_URL,
  SITE_NAME,
  TWITTER_HANDLE,
  DEFAULT_OG_IMAGE,
  DEFAULT_DESCRIPTION,
} from "@/lib/constants/seo";
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
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Creator Analytics Platform`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    title: `${SITE_NAME} | Creator Analytics Platform`,
    description: DEFAULT_DESCRIPTION,
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    images: [
      { url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: {
    canonical: SITE_URL,
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
