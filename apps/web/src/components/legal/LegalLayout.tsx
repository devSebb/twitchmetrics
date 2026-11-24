import Link from "next/link";
import type { LegalDocument, LegalSlug } from "@/lib/legal-markdown";

const ALT_LANGUAGE_LABEL = {
  en: "Español",
  es: "English",
} as const;

const ALT_LANGUAGE_PATH_PREFIX = {
  en: "/es",
  es: "",
} as const;

function formatLastUpdated(iso: string, locale: "en" | "es") {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = dateParts
    ? new Date(
        Number(dateParts[1]),
        Number(dateParts[2]) - 1,
        Number(dateParts[3]),
      )
    : new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

const UPDATED_LABEL = {
  en: "Last updated:",
  es: "Última actualización:",
} as const;

type Props = {
  document: LegalDocument;
  slug: LegalSlug;
};

export function LegalLayout({ document, slug }: Props) {
  const altPath = `${ALT_LANGUAGE_PATH_PREFIX[document.language]}/${slug}`;

  return (
    <div className="mx-auto max-w-[960px] px-5 py-12 sm:px-8 sm:py-20">
      <div className="">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-n-line pb-6">
          <div>
            <h1 className="text-[clamp(2.25rem,5vw,4rem)] font-extrabold tracking-tight text-n-ink">
              {document.title}
            </h1>
            <p className="mt-2 text-xs text-n-slate">
              {UPDATED_LABEL[document.language]}{" "}
              {formatLastUpdated(document.lastUpdated, document.language)}
            </p>
          </div>
          <Link href={altPath} className="n-button n-button-secondary">
            {ALT_LANGUAGE_LABEL[document.language]}
          </Link>
        </div>

        <p className="mb-8 border-l-2 border-n-red pl-4 text-sm leading-relaxed text-n-slate">
          {document.language === "es"
            ? "Noticed es el nuevo nombre del producto. Los documentos publicados a continuación conservan las referencias a TwitchMetrics y sus fechas originales."
            : "Noticed is the new product name. The published policies below retain their TwitchMetrics references and original update dates."}
        </p>
        <article
          className="legal-prose"
          lang={document.language}
          dangerouslySetInnerHTML={{ __html: document.html }}
        />
      </div>
    </div>
  );
}
