"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { type Platform, PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { formatNumber, formatDuration } from "@/lib/utils/format";
import { getSafeImageSrc } from "@/lib/safeImage";
import { PlatformIcon, TrendIndicator } from "@/components/shared";
import { cn } from "@/lib/utils";

export type CreatorListRow = {
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  primaryPlatform: Platform;
  totalFollowers: string;
  platformAccounts: { platform: Platform; platformUsername: string }[];
  growthRollup: {
    delta7d: string;
    pct7d: number;
    trendDirection: string;
  } | null;
  airTimeSeconds?: number | null;
  avgAirTimeSeconds?: number | null;
  peakViewers?: number | null;
  avgViewers?: number | null;
};

type Props = {
  rows: CreatorListRow[];
};

function Avatar({
  displayName,
  avatarUrl,
  primaryPlatform,
}: {
  displayName: string;
  avatarUrl: string | null;
  primaryPlatform: Platform;
}) {
  const safe = getSafeImageSrc(avatarUrl);
  if (safe) {
    return (
      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[#383A40]">
        <Image
          src={safe}
          alt={displayName}
          fill
          className="object-cover"
          sizes="40px"
        />
      </div>
    );
  }
  const config = PLATFORM_CONFIG[primaryPlatform];
  return (
    <div
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold"
      style={{
        backgroundColor: config.color,
        color: config.foregroundColor,
      }}
    >
      {displayName.charAt(0)}
    </div>
  );
}

function PlatformLogos({
  accounts,
}: {
  accounts: CreatorListRow["platformAccounts"];
}) {
  return (
    <div className="flex gap-1.5">
      {accounts.map((a) => (
        <PlatformIcon
          key={a.platform}
          platform={a.platform}
          size="xs"
          className="h-3.5 w-3.5"
        />
      ))}
    </div>
  );
}

function EmDash() {
  return <span className="text-[#949BA4]">—</span>;
}

function formatViewers(value: number | null | undefined) {
  return value != null ? formatNumber(value) : <EmDash />;
}

function formatAirtime(seconds: number | null | undefined) {
  return seconds != null ? formatDuration(seconds) : <EmDash />;
}

const HEADER_CLASS = "px-3 py-2 text-xs font-medium text-[#949BA4]";

/**
 * Column header wired to the same `?sort=` mechanism as the sort pills, so
 * the active sort always corresponds to a visible, highlighted column.
 */
function SortableHeader({
  label,
  sortValue,
}: {
  label: string;
  sortValue: "followers" | "trending";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("sort") ?? "followers";
  const isActive = current === sortValue;

  function handleSelect() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", sortValue);
    params.delete("page");
    router.push(`/creators?${params.toString()}`);
  }

  return (
    <th
      className={HEADER_CLASS}
      aria-sort={isActive ? "descending" : undefined}
    >
      <button
        type="button"
        onClick={handleSelect}
        className={cn(
          "flex items-center gap-1 transition-colors",
          isActive ? "text-[#F2F3F5]" : "hover:text-[#DBDEE1]",
        )}
      >
        {label}
        {isActive && <span aria-hidden>↓</span>}
      </button>
    </th>
  );
}

export function CreatorList({ rows }: Props) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#3F4147]">
              <th className={HEADER_CLASS}>Channel</th>
              <th className={HEADER_CLASS}>Platforms</th>
              <SortableHeader label="Followers" sortValue="followers" />
              <SortableHeader label="7d Trend" sortValue="trending" />
              <th className={HEADER_CLASS}>Air Time</th>
              <th className={HEADER_CLASS}>Avg Air Time</th>
              <th className={HEADER_CLASS}>Peak Viewers</th>
              <th className={HEADER_CLASS}>Avg Viewers</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.slug}
                className="border-b border-[#3F4147]/50 transition-colors hover:bg-[#383A40]"
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={`/creator/${row.slug}`}
                    className="flex items-center gap-3 text-[#F2F3F5] hover:text-white"
                  >
                    <Avatar
                      displayName={row.displayName}
                      avatarUrl={row.avatarUrl}
                      primaryPlatform={row.primaryPlatform}
                    />
                    <span className="truncate font-medium">
                      {row.displayName}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <PlatformLogos accounts={row.platformAccounts} />
                </td>
                <td className="px-3 py-2.5 text-[#DBDEE1]">
                  {formatNumber(Number(row.totalFollowers))}
                </td>
                <td className="px-3 py-2.5">
                  {row.growthRollup ? (
                    <TrendIndicator
                      direction={row.growthRollup.trendDirection}
                      delta={row.growthRollup.delta7d}
                      pct={row.growthRollup.pct7d}
                    />
                  ) : (
                    <EmDash />
                  )}
                </td>
                <td className="px-3 py-2.5 text-[#DBDEE1]">
                  {formatAirtime(row.airTimeSeconds)}
                </td>
                <td className="px-3 py-2.5 text-[#DBDEE1]">
                  {formatAirtime(row.avgAirTimeSeconds)}
                </td>
                <td className="px-3 py-2.5 text-[#DBDEE1]">
                  {formatViewers(row.peakViewers)}
                </td>
                <td className="px-3 py-2.5 text-[#DBDEE1]">
                  {formatViewers(row.avgViewers)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked rows */}
      <div className="divide-y divide-[#3F4147]/50 sm:hidden">
        {rows.map((row) => (
          <Link
            key={row.slug}
            href={`/creator/${row.slug}`}
            className="flex items-center gap-3 py-3 transition-colors hover:bg-[#383A40]"
          >
            <Avatar
              displayName={row.displayName}
              avatarUrl={row.avatarUrl}
              primaryPlatform={row.primaryPlatform}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-[#F2F3F5]">
                  {row.displayName}
                </span>
                <PlatformLogos accounts={row.platformAccounts} />
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[#949BA4]">
                <span>
                  {formatNumber(Number(row.totalFollowers))} followers
                </span>
                {row.growthRollup && (
                  <TrendIndicator
                    direction={row.growthRollup.trendDirection}
                    delta={row.growthRollup.delta7d}
                    pct={row.growthRollup.pct7d}
                  />
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-[#949BA4]">
                <span>
                  {row.airTimeSeconds != null
                    ? formatDuration(row.airTimeSeconds)
                    : "—"}
                </span>
                <span aria-hidden>·</span>
                <span>
                  {row.avgAirTimeSeconds != null
                    ? formatDuration(row.avgAirTimeSeconds)
                    : "—"}{" "}
                  avg
                </span>
                <span aria-hidden>·</span>
                <span>
                  {row.peakViewers != null
                    ? `${formatNumber(row.peakViewers)} peak`
                    : "— peak"}
                </span>
                <span aria-hidden>·</span>
                <span>
                  {row.avgViewers != null
                    ? `${formatNumber(row.avgViewers)} avg`
                    : "— avg"}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
