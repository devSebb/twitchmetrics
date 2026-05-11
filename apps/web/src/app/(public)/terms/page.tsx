import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { loadLegalDocument } from "@/lib/legal-markdown";
import { SITE_URL } from "@/lib/constants/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "Terms and Conditions of Use for the Stream Hatchet Creator platform.",
  alternates: {
    canonical: `${SITE_URL}/terms`,
    languages: {
      en: `${SITE_URL}/terms`,
      es: `${SITE_URL}/es/terms`,
    },
  },
};

export default async function TermsPage() {
  const document = await loadLegalDocument("en", "terms");
  return <LegalLayout document={document} slug="terms" />;
}
