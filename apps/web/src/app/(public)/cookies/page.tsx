import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { loadLegalDocument } from "@/lib/legal-markdown";
import { SITE_URL } from "@/lib/constants/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "How TwitchMetrics uses technical cookies, authentication cookies, security cookies and similar technologies.",
  alternates: {
    canonical: `${SITE_URL}/cookies`,
    languages: {
      en: `${SITE_URL}/cookies`,
      es: `${SITE_URL}/es/cookies`,
      "x-default": `${SITE_URL}/cookies`,
    },
  },
};

export default async function CookiesPage() {
  const document = await loadLegalDocument("en", "cookies");
  return <LegalLayout document={document} slug="cookies" />;
}
