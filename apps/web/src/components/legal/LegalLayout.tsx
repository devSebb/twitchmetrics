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
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-6 sm:p-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-[#3F4147] pb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#F2F3F5] sm:text-3xl">
              {document.title}
            </h1>
            <p className="mt-2 text-xs text-[#949BA4]">
              {UPDATED_LABEL[document.language]}{" "}
              {formatLastUpdated(document.lastUpdated, document.language)}
            </p>
          </div>
          <Link
            href={altPath}
            className="rounded-md border border-[#3F4147] px-3 py-1.5 text-xs font-medium text-[#DBDEE1] transition-colors hover:bg-[#383A40]"
          >
            {ALT_LANGUAGE_LABEL[document.language]}
          </Link>
        </div>

        <article
          className="legal-prose"
          dangerouslySetInnerHTML={{ __html: document.html }}
        />
      </div>
    </div>
  );
}
