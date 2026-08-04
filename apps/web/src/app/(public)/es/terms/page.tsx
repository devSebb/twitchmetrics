import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { loadLegalDocument } from "@/lib/legal-markdown";
import { SITE_URL } from "@/lib/constants/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Términos y Condiciones",
  description:
    "Términos y Condiciones de Uso de la plataforma Stream Hatchet Creator.",
  alternates: {
    canonical: `${SITE_URL}/es/terms`,
    languages: {
      en: `${SITE_URL}/terms`,
      es: `${SITE_URL}/es/terms`,
      "x-default": `${SITE_URL}/terms`,
    },
  },
};

export default async function TermsPageES() {
  const document = await loadLegalDocument("es", "terms");
  return <LegalLayout document={document} slug="terms" />;
}
