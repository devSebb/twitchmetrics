import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { loadLegalDocument } from "@/lib/legal-markdown";
import { SITE_URL } from "@/lib/constants/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Stream Hatchet processes personal data on the Stream Hatchet Creator platform.",
  alternates: {
    canonical: `${SITE_URL}/privacy`,
    languages: {
      en: `${SITE_URL}/privacy`,
      es: `${SITE_URL}/es/privacy`,
    },
  },
};

export default async function PrivacyPage() {
  const document = await loadLegalDocument("en", "privacy");
  return <LegalLayout document={document} slug="privacy" />;
}
