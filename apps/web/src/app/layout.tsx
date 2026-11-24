import type { Metadata } from "next";
import { Providers } from "./providers";
import {
  SITE_URL,
  SITE_NAME,
  TWITTER_HANDLE,
  DEFAULT_OG_IMAGE,
  DEFAULT_DESCRIPTION,
} from "@/lib/constants/seo";
import "./globals.css";
import "./noticed.css";
import { NOTICED_CSS_VARS } from "@/lib/constants/noticed";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Creator Analytics Platform`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  icons: {
    icon: "/icon.svg",
  },
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/golos-text-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body style={NOTICED_CSS_VARS} className="noticed font-body antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
