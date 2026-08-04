import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { loadLegalDocument } from "@/lib/legal-markdown";
import { SITE_URL } from "@/lib/constants/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description:
    "Cómo Stream Hatchet trata los datos personales en la plataforma Stream Hatchet Creator.",
  alternates: {
    canonical: `${SITE_URL}/es/privacy`,
    languages: {
      en: `${SITE_URL}/privacy`,
      es: `${SITE_URL}/es/privacy`,
      "x-default": `${SITE_URL}/privacy`,
    },
  },
};

export default async function PrivacyPageES() {
  const document = await loadLegalDocument("es", "privacy");
  return <LegalLayout document={document} slug="privacy" />;
}
