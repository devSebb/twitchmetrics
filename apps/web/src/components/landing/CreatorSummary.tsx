import Link from "next/link";
import {
  PLATFORM_CONFIG,
  sortByPlatformOrder,
} from "@/lib/constants/platforms";
import { formatNumber } from "@/lib/utils/format";
import { CreatorPortrait } from "./CreatorPortrait";
import type { LandingCreator } from "./types";

export function GrowthValue({ creator }: { creator: LandingCreator }) {
  if (!creator.growthRollup)
    return <span className="text-n-slate">Not enough history</span>;
  const delta = Number(creator.growthRollup.delta7d);
  const percentage = creator.growthRollup.pct7d;
  const absolutePercentage = Math.abs(percentage).toFixed(1);
  const percentageSign =
    absolutePercentage === "0.0" ? "" : percentage > 0 ? "+" : "−";
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1">
      <span>
        {delta > 0 ? "+" : ""}
        {formatNumber(delta)}
      </span>
      <span className="text-xs font-normal text-n-slate">
        ({percentageSign}
        {absolutePercentage}%)
      </span>
    </span>
  );
}

export function LandingPlatforms({ creator }: { creator: LandingCreator }) {
  return (
    <span className="mt-2 flex flex-wrap gap-1">
      {sortByPlatformOrder(creator.platformAccounts)
        .filter(
          (account, index, accounts) =>
            accounts.findIndex((item) => item.platform === account.platform) ===
            index,
        )
        .map((account) => (
          <span
            key={account.platform}
            className="border border-n-line px-1.5 py-0.5 text-[11px] leading-4 text-n-slate"
          >
            {PLATFORM_CONFIG[account.platform].name}
          </span>
        ))}
    </span>
  );
}
export function CreatorSummary({
  creator,
  growth = false,
}: {
  creator: LandingCreator;
  growth?: boolean;
}) {
  return (
    <Link
      href={`/creator/${creator.slug}`}
      className="group flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-n-line py-4 transition-colors hover:bg-n-surface sm:gap-x-4"
    >
      <CreatorPortrait
        src={creator.avatarUrl}
        name={creator.displayName}
        className="h-12 w-12"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold group-hover:underline">
          {creator.displayName}
        </span>
        <span className="mt-1 block text-xs text-n-slate">
          {PLATFORM_CONFIG[creator.primaryPlatform].name}
          {growth ? " · follower change, 7 days" : " · total followers"}
        </span>
        {!growth && creator.growthRollup && (
          <span className="mt-1 block text-xs">
            <GrowthValue creator={creator} /> · 7 days
          </span>
        )}
      </span>
      <span className="max-w-[38%] shrink-0 text-right text-base font-semibold tabular-nums">
        {growth ? (
          <GrowthValue creator={creator} />
        ) : (
          formatNumber(Number(creator.totalFollowers))
        )}
        {growth && (
          <span className="mt-1 block text-xs font-normal text-n-slate">
            {formatNumber(Number(creator.totalFollowers))} total
          </span>
        )}
      </span>
      <span className="w-full">
        <LandingPlatforms creator={creator} />
      </span>
    </Link>
  );
}
