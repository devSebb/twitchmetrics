import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { loadLegalDocument } from "@/lib/legal-markdown";
import { SITE_URL } from "@/lib/constants/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Política de Cookies",
  description:
    "Cómo TwitchMetrics utiliza cookies técnicas, de autenticación, seguridad y tecnologías similares.",
  alternates: {
    canonical: `${SITE_URL}/es/cookies`,
    languages: {
      en: `${SITE_URL}/cookies`,
      es: `${SITE_URL}/es/cookies`,
      "x-default": `${SITE_URL}/cookies`,
    },
  },
};

export default async function CookiesPageES() {
  const document = await loadLegalDocument("es", "cookies");
  return <LegalLayout document={document} slug="cookies" />;
}
