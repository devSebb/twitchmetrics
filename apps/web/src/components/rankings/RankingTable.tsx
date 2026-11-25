import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { RankingMovement } from "@/server/services/rankings";

/**
 * The one table every ranking uses, so every ranking looks the same: fixed
 * column widths, a 40px lead image, two text lines per row and right-aligned
 * figures. A missing figure is a dash in the same place, never a different
 * row shape.
 *
 * All rows are rendered. Rows past `openRows` carry data-more and are hidden
 * by CSS until the checkbox under the table is ticked (noticed.css), so the
 * whole ranking is in the HTML for crawlers.
 */

export type RankingColumn = {
  key: string;
  label: string;
  /** Longer name for screen readers and the header's title. */
  description?: string;
};

export type RankingTableRow = {
  rank: number;
  movement: RankingMovement;
  href: string;
  name: string;
  /** 40px-tall image or avatar. */
  lead: ReactNode;
  /** Second line under the name. */
  detail?: ReactNode;
  cells: Record<string, ReactNode>;
};

const DASH = <span className="text-n-slate">—</span>;

/**
 * Narrow screens show the ranked column only. The next two columns join from
 * 768px, a third from 1024px and the rest from 1280px, so the name column
 * always keeps room for a name.
 */
function columnVisibility(index: number, isRanked: boolean): string {
  if (isRanked) return "";
  if (index < 2) return "hidden md:table-cell";
  return index < 3 ? "hidden lg:table-cell" : "hidden xl:table-cell";
}

export function Movement({ movement }: { movement: RankingMovement }) {
  switch (movement.kind) {
    case "none":
      return null;
    case "new":
      return (
        <span className="text-xs font-semibold text-n-navy">
          New<span className="sr-only"> in this ranking</span>
        </span>
      );
    case "same":
      return (
        <span className="text-n-slate">
          <span aria-hidden>–</span>
          <span className="sr-only">No change</span>
        </span>
      );
    case "up":
      return (
        <span className="whitespace-nowrap text-xs font-semibold text-n-success">
          <span aria-hidden>▲ </span>
          <span className="sr-only">Up </span>
          {movement.places}
        </span>
      );
    case "down":
      return (
        <span className="whitespace-nowrap text-xs font-semibold text-n-red">
          <span aria-hidden>▼ </span>
          <span className="sr-only">Down </span>
          {movement.places}
        </span>
      );
  }
}

export function RankingTable({
  caption,
  subject,
  columns,
  rankedKey,
  rows,
  openRows,
  compact = false,
}: {
  /** Names the table for screen readers; not shown. */
  caption: string;
  /** Header of the name column: "Creator" or "Category". */
  subject: string;
  columns: RankingColumn[];
  rankedKey: string;
  rows: RankingTableRow[];
  /** Rows visible before "show all"; omit to show every row. */
  openRows?: number;
  /** Hub previews: rank, name and the ranked column only, at every width. */
  compact?: boolean;
}) {
  // Previews never show movement: some rankings have none yet, and cards
  // sitting side by side must have the same columns.
  const showMovement =
    !compact && rows.some((row) => row.movement.kind !== "none");
  const shown = compact
    ? columns.filter((column) => column.key === rankedKey)
    : columns;
  const others = shown.filter((column) => column.key !== rankedKey);
  const hasMore = openRows != null && rows.length > openRows;

  return (
    <div className="n-ranking">
      <table className="n-ranking-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-9 sm:w-12">
              <span aria-hidden>#</span>
              <span className="sr-only">Rank</span>
            </th>
            {showMovement && (
              <th scope="col" className="w-11 sm:w-16">
                <span className="sr-only sm:not-sr-only">Change</span>
              </th>
            )}
            <th scope="col">{subject}</th>
            {shown.map((column) => {
              const isRanked = column.key === rankedKey;
              return (
                <th
                  key={column.key}
                  scope="col"
                  title={column.description}
                  aria-sort={isRanked ? "descending" : undefined}
                  className={cn(
                    "text-right",
                    isRanked
                      ? "w-[6.5rem] font-bold text-n-ink sm:w-[7.5rem]"
                      : "w-28",
                    columnVisibility(others.indexOf(column), isRanked),
                  )}
                >
                  {column.label}
                  {/* No-break space: the arrow never wraps onto its own line. */}
                  {isRanked && <span aria-hidden>{"\u00a0↓"}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.rank}
              data-more={openRows != null && index >= openRows ? "" : undefined}
            >
              <td className="text-base font-bold text-n-ink">{row.rank}</td>
              {showMovement && (
                <td>
                  <Movement movement={row.movement} />
                </td>
              )}
              <td>
                <Link
                  href={row.href}
                  className="group flex min-w-0 items-center gap-3"
                >
                  {row.lead}
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-n-ink group-hover:underline">
                      {row.name}
                    </span>
                    {row.detail != null && (
                      <span className="mt-0.5 flex h-4 min-w-0 items-center gap-1.5 text-xs text-n-slate">
                        {row.detail}
                      </span>
                    )}
                  </span>
                </Link>
              </td>
              {shown.map((column) => {
                const isRanked = column.key === rankedKey;
                return (
                  <td
                    key={column.key}
                    className={cn(
                      "text-right",
                      isRanked
                        ? "text-base font-bold text-n-ink"
                        : "text-n-ink",
                      columnVisibility(others.indexOf(column), isRanked),
                    )}
                  >
                    {row.cells[column.key] ?? DASH}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <label className="n-ranking-toggle-label n-button n-button-secondary cursor-pointer">
            <input type="checkbox" className="n-ranking-toggle sr-only" />
            <span className="n-ranking-toggle-more">
              Show all {rows.length}
            </span>
            <span className="n-ranking-toggle-less">Show top {openRows}</span>
          </label>
        </div>
      )}
    </div>
  );
}
