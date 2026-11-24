import { CreatorPortrait } from "@/components/landing/CreatorPortrait";
import Link from "next/link";
import {
  type Platform,
  PLATFORM_CONFIG,
  sortByPlatformOrder,
} from "@/lib/constants/platforms";
import { formatNumber } from "@/lib/utils/format";
import { PlatformIcon } from "./PlatformIcon";

type CreatorCardProps = {
  creator: {
    displayName: string;
    slug: string;
    avatarUrl: string | null;
    totalFollowers: string;
    /** Follower count for the active platform filter; falls back to totalFollowers. */
    displayFollowers?: string;
    primaryPlatform: Platform;
    platformAccounts: { platform: Platform; platformUsername: string }[];
    growthRollup: {
      delta7d: string;
      pct7d: number;
      trendDirection: string;
    } | null;
  };
  /** Compact mode for use in trending lists */
  compact?: boolean;
  appearance?: "noticed";
  selectedPlatform?: Platform | undefined;
};

export function TrendIndicator({ delta, pct }: { delta: string; pct: number }) {
  // Direction is derived from the actual delta so a follower loss can never
  // render green, even if the stored trendDirection disagrees.
  const deltaNum = Number(delta);
  const isUp = deltaNum > 0;
  const isDown = deltaNum < 0;

  const color = isUp
    ? "text-n-success"
    : isDown
      ? "text-n-red"
      : "text-n-slate";
  const arrow = isUp ? "▲" : isDown ? "▼" : "–";
  const sign = isUp ? "+" : isDown ? "-" : "";

  // Normalize -0.0% and keep the sign out of toFixed so it can't double up.
  const pctAbs = Math.abs(pct).toFixed(1);
  const pctSign = pctAbs === "0.0" ? "" : pct > 0 ? "+" : "-";

  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${color}`}>
      <span className="text-[10px]">{arrow}</span>
      {sign}
      {formatNumber(Math.abs(deltaNum))}
      <span className="text-n-slate">
        ({pctSign}
        {pctAbs}%)
      </span>
    </span>
  );
}

export function CreatorCard({
  creator,
  compact: _compact,
  appearance: _appearance,
  selectedPlatform,
}: CreatorCardProps) {
  const followers = Number(creator.displayFollowers ?? creator.totalFollowers);
  const primaryConfig = PLATFORM_CONFIG[creator.primaryPlatform];

  return (
    <Link
      href={`/creator/${creator.slug}`}
      className="group min-w-0 border-t border-n-line py-6 transition-colors hover:border-n-ink"
    >
      <div className="flex items-center gap-4">
        <CreatorPortrait
          src={creator.avatarUrl}
          name={creator.displayName}
          className="h-16 w-16"
        />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold tracking-tight group-hover:underline">
            {creator.displayName}
          </h2>
          <p className="mt-1 text-xs text-n-slate">{primaryConfig.name}</p>
        </div>
      </div>
      <p className="mt-6 text-3xl font-extrabold tracking-tight">
        {formatNumber(followers)}
      </p>
      <p className="mt-1 text-xs text-n-slate">
        {selectedPlatform
          ? `Followers on ${PLATFORM_CONFIG[selectedPlatform].name}`
          : "Followers across tracked accounts"}
      </p>
      <div
        className="mt-4 flex flex-wrap items-center gap-2"
        aria-label="Tracked platforms"
      >
        {sortByPlatformOrder(creator.platformAccounts).map((account) => (
          <PlatformIcon
            key={account.platform}
            platform={account.platform}
            size="sm"
          />
        ))}
      </div>
      <div className="mt-4 min-h-10">
        <p className="mb-1 text-xs text-n-slate">
          {selectedPlatform
            ? `${PLATFORM_CONFIG[selectedPlatform].name} · `
            : "Tracked "}
          7-day follower change
        </p>
        {creator.growthRollup ? (
          <TrendIndicator
            delta={creator.growthRollup.delta7d}
            pct={creator.growthRollup.pct7d}
          />
        ) : (
          <span className="text-xs text-n-slate">Not enough history</span>
        )}
      </div>
    </Link>
  );
}
