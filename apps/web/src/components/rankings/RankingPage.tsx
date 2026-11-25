import Link from "next/link";
import type { ReactNode } from "react";
import {
  ActionLink,
  Container,
  SectionHeading,
} from "@/components/ui/Editorial";
import { cn } from "@/lib/utils";
import {
  RANKING_WINDOW_DAYS,
  RANKINGS_PATH,
  rankingDay,
  windowStart,
} from "@/lib/rankings";

/**
 * The one template every ranking page is built from (creators, a game's
 * creators, categories). Its order follows the team's ranking template:
 * answer first, then the figures, then the full table, then how it was made.
 * Each page passes text written from its own rows, so no two pages share a
 * paragraph.
 */

export type RankingCrumb = { label: string; href?: string };
export type RankingStat = { label: string; value: string; note: string };
export type RankingFilterGroup = {
  label: string;
  options: { label: string; href: string; active?: boolean }[];
};
export type RankingFaq = { question: string; answer: string };
export type RankingLinkGroup = {
  title: string;
  links: { label: string; href: string }[];
};

function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function RankingFilters({ groups }: { groups: RankingFilterGroup[] }) {
  return (
    <div className="mb-8 space-y-4">
      {groups.map((group) => (
        <nav
          key={group.label}
          aria-label={group.label}
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
        >
          <span className="n-eyebrow w-24 shrink-0 text-n-slate">
            {group.label}
          </span>
          {/* Padding cancelled by the margin keeps the focus ring unclipped. */}
          <ul className="-m-1 flex flex-wrap gap-2 p-1">
            {group.options.map((option) => (
              <li key={option.href}>
                <Link
                  href={option.href}
                  aria-current={option.active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                    option.active
                      ? "border-n-red bg-n-red text-white"
                      : "border-n-line bg-n-canvas text-n-ink hover:border-n-control hover:bg-n-surface",
                  )}
                >
                  {option.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </div>
  );
}

export function RankingPage({
  breadcrumbs,
  title,
  windowEnd,
  computedAt,
  rankedLine,
  summary,
  topTen,
  stats,
  filters,
  table,
  sortedLine,
  faqs,
  methodology,
  citation,
  related,
  canonicalUrl,
  itemList,
}: {
  breadcrumbs: RankingCrumb[];
  title: string;
  windowEnd: Date;
  computedAt: Date;
  /** "50 creators ranked by hours watched on Twitch". */
  rankedLine: string;
  summary: string;
  topTen: { name: string; href: string }[];
  stats: RankingStat[];
  filters: RankingFilterGroup[];
  table: ReactNode;
  /** "Sorted by hours watched on Twitch". */
  sortedLine: string;
  faqs: RankingFaq[];
  methodology: string[];
  citation: string;
  related: RankingLinkGroup[];
  canonicalUrl: string;
  /** Absolute URLs, in rank order, for the ItemList schema. */
  itemList: { name: string; url: string }[];
}) {
  const from = rankingDay(windowStart(windowEnd));
  const to = rankingDay(windowEnd);
  const siteUrl = new URL(canonicalUrl).origin;

  return (
    <div className="noticed">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: title,
          url: canonicalUrl,
          dateModified: computedAt.toISOString(),
          numberOfItems: itemList.length,
          itemListOrder: "https://schema.org/ItemListOrderDescending",
          itemListElement: itemList.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            url: item.url,
          })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbs.map((crumb, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: crumb.label,
            item: crumb.href ? `${siteUrl}${crumb.href}` : canonicalUrl,
          })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
          })),
        }}
      />

      <Container className="pb-16 pt-8 sm:pb-24 sm:pt-12">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-n-slate">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {breadcrumbs.map((crumb, index) => (
              <li key={crumb.label} className="flex items-center gap-2">
                {index > 0 && <span aria-hidden>/</span>}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-n-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-n-ink">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <header className="max-w-4xl">
          <h1 className="text-[clamp(2rem,4.5vw,3.5rem)] font-extrabold leading-[1.05] tracking-[-.045em] text-n-ink">
            {title}
          </h1>
          <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-n-slate">
            <span>
              Updated{" "}
              <time dateTime={computedAt.toISOString()}>
                {rankingDay(computedAt)}
              </time>
            </span>
            <span>{rankedLine}</span>
            <span>Data by Hatchet</span>
            <a href="#methodology" className="text-n-ink underline">
              Methodology
            </a>
          </p>
        </header>

        <section
          aria-labelledby="summary-title"
          className="mt-10 grid gap-8 border-y border-n-line py-8 lg:grid-cols-[1.4fr_1fr] lg:gap-14"
        >
          <div>
            <h2 id="summary-title" className="n-eyebrow mb-3 text-n-red">
              Summary
            </h2>
            <p className="text-lg leading-relaxed text-n-ink sm:text-xl">
              {summary}
            </p>
          </div>
          <div>
            <h2 className="n-eyebrow mb-3 text-n-slate">
              The top {topTen.length} at a glance
            </h2>
            <ol className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {topTen.map((item, index) => (
                <li key={item.href} className="flex min-w-0 gap-2">
                  <span className="w-5 shrink-0 text-right font-bold text-n-red">
                    {index + 1}
                  </span>
                  <Link
                    href={item.href}
                    className="truncate font-medium text-n-ink hover:underline"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="stats-title" className="mt-10">
          <h2 id="stats-title" className="sr-only">
            Key figures, {from} to {to}
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="min-w-0 border-t-2 border-n-ink pt-4"
              >
                <dt className="text-xs font-medium text-n-slate">
                  {stat.label}
                </dt>
                <dd className="mt-1 truncate text-2xl font-extrabold tracking-tight text-n-ink sm:text-3xl">
                  {stat.value}
                </dd>
                <dd className="mt-1 truncate text-xs text-n-slate">
                  {stat.note}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="ranking-title" className="mt-16 sm:mt-20">
          <SectionHeading
            number="01"
            title="The full ranking"
            id="ranking-title"
          >
            <p className="text-sm text-n-slate">{sortedLine}</p>
          </SectionHeading>
          <RankingFilters groups={filters} />
          {table}
          <p className="mt-6 text-xs leading-relaxed text-n-slate">
            Source: Hatchet stream and audience data, {from} to {to} (UTC).
            Figures are rounded.
          </p>
        </section>

        <section className="mt-16 flex flex-wrap items-center justify-between gap-6 bg-n-surface px-6 py-8 sm:mt-20 sm:px-10">
          <div className="max-w-xl">
            <h2 className="text-2xl font-extrabold tracking-tight text-n-ink">
              Should you be on this list?
            </h2>
            <p className="mt-2 text-base leading-relaxed text-n-slate">
              Claim your free media kit to keep your figures current and give
              brands one link that shows where you rank.
            </p>
          </div>
          <ActionLink href="/claim">Claim your profile</ActionLink>
        </section>

        <section aria-labelledby="faq-title" className="mt-16 sm:mt-20">
          <SectionHeading
            number="02"
            title="Questions about this ranking"
            id="faq-title"
          />
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="n-faq border-b border-n-line py-5 sm:py-6"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-6 text-lg font-bold tracking-tight sm:text-xl">
                {faq.question}
              </summary>
              <p className="mt-4 max-w-3xl pr-8 text-base leading-relaxed text-n-slate">
                {faq.answer}
              </p>
            </details>
          ))}
        </section>

        <section aria-labelledby="methodology" className="mt-16 sm:mt-20">
          <SectionHeading number="03" title="Methodology" id="methodology" />
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
            <ul className="space-y-3 text-base leading-relaxed text-n-slate">
              <li>
                This ranking covers the {RANKING_WINDOW_DAYS} complete days from{" "}
                {from} to {to} (UTC) and is rebuilt every day.
              </li>
              {methodology.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div>
              <h3 className="n-eyebrow mb-3 text-n-slate">Cite this ranking</h3>
              <p className="select-all border border-n-line p-4 text-sm leading-relaxed text-n-ink">
                {citation}
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="related-title" className="mt-16 sm:mt-20">
          <SectionHeading
            number="04"
            title="Explore related rankings"
            id="related-title"
          >
            <Link
              href={RANKINGS_PATH}
              className="text-sm font-bold text-n-ink underline"
            >
              All rankings
            </Link>
          </SectionHeading>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((group) => (
              <div key={group.title}>
                <h3 className="n-eyebrow mb-4 text-n-slate">{group.title}</h3>
                <ul className="space-y-2.5 text-base">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="font-medium text-n-ink hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </Container>
    </div>
  );
}
