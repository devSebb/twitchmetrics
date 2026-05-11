import Link from "next/link";
import Image from "next/image";
import { type Platform, PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { formatNumber, formatDuration } from "@/lib/utils/format";
import { getSafeImageSrc } from "@/lib/safeImage";

export type CreatorListRow = {
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  primaryPlatform: Platform;
  platformAccounts: { platform: Platform; platformUsername: string }[];
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
  return (
    <div
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
      style={{ backgroundColor: PLATFORM_CONFIG[primaryPlatform].color }}
    >
      {displayName.charAt(0)}
    </div>
  );
}

function PlatformDots({
  accounts,
}: {
  accounts: CreatorListRow["platformAccounts"];
}) {
  return (
    <div className="flex gap-1.5">
      {accounts.map((a) => (
        <span
          key={a.platform}
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: PLATFORM_CONFIG[a.platform].color }}
          title={PLATFORM_CONFIG[a.platform].name}
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

export function CreatorList({ rows }: Props) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#3F4147]">
              <th className="px-3 py-2 text-xs font-medium text-[#949BA4]">
                Channel
              </th>
              <th className="px-3 py-2 text-xs font-medium text-[#949BA4]">
                Platforms
              </th>
              <th className="px-3 py-2 text-xs font-medium text-[#949BA4]">
                Air Time
              </th>
              <th className="px-3 py-2 text-xs font-medium text-[#949BA4]">
                Avg Air Time
              </th>
              <th className="px-3 py-2 text-xs font-medium text-[#949BA4]">
                Peak Viewers
              </th>
              <th className="px-3 py-2 text-xs font-medium text-[#949BA4]">
                Avg Viewers
              </th>
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
                  <PlatformDots accounts={row.platformAccounts} />
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
                <PlatformDots accounts={row.platformAccounts} />
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
