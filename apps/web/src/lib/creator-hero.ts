import type { Platform, ProfileState } from "@twitchmetrics/database";
import {
  PLATFORM_CONFIG,
  PLATFORM_DISPLAY_ORDER,
} from "@/lib/constants/platforms";
import { getPlatformProfileUrl } from "@/lib/platform-profile-url";
import { formatNumber } from "@/lib/utils/format";

export type CreatorHeroAccount = {
  platform: Platform;
  platformUsername: string;
  platformUrl: string | null;
  /** Own channel plus the creator's other channels on the platform. */
  followerCount: string | null;
  totalViews: string | null;
  postCount: number | null;
};

export type CreatorHeroGrowth = {
  platform: Platform;
  delta7d: string;
  pct7d: number;
  trendDirection: string;
};

/** Header payload shared by the public profile, the media kit and the owner
 * dashboard. Public facts only: it is serialised to the browser. */
export type CreatorHeroData = {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  country: string | null;
  language: string | null;
  age: number | null;
  state: ProfileState;
  primaryPlatform: Platform;
  totalFollowers: string;
  lastSnapshotAt: string | null;
  primaryGameName: string | null;
  lastStreamAt: string | null;
  platformAccounts: CreatorHeroAccount[];
  growthRollups: CreatorHeroGrowth[];
};

export type CreatorHeroNameSize = "xl" | "lg" | "md" | "sm";

export type CreatorHeroCell = {
  platform: Platform;
  name: string;
  color: string;
  unit: "Subscribers" | "Followers";
  handle: string;
  href: string | null;
  /** Compact count, or an em dash when the platform does not publish one. */
  display: string;
  missing: boolean;
  /** Share of the counted audience, e.g. "32.6%". Null when uncounted. */
  share: string | null;
  /** Bar length relative to the largest platform, 0-100. Null when uncounted. */
  barPct: number | null;
};

export type CreatorHeroModel = {
  /** none: no accounts. single: one account, shown as the headline.
   * multi: a total followed by one cell per platform. */
  mode: "none" | "single" | "multi";
  cells: CreatorHeroCell[];
  totalLabel: string;
  total: string;
  nameSize: CreatorHeroNameSize;
  meta: string[];
  lastStreamed: string | null;
  bioPreview: string | null;
  hasFullBio: boolean;
};

/** Bios longer than this get a "Read full bio" control beside the preview. */
export const BIO_PREVIEW_MAX_CHARS = 180;

const MISSING = "—";
const NAME_SIZES: CreatorHeroNameSize[] = ["xl", "lg", "md", "sm"];
const DAY_MS = 24 * 60 * 60 * 1000;

function toCount(value: string | null): number | null {
  if (value == null) return null;
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
}

function displayName(type: "region" | "language", code: string): string | null {
  try {
    const name = new Intl.DisplayNames(["en"], { type }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

export function countryLabel(value: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (!/^[A-Za-z]{2}$/.test(raw)) return raw;
  return displayName("region", raw.toUpperCase()) ?? raw.toUpperCase();
}

export function languageLabel(value: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(raw)) return raw;
  return displayName("language", raw) ?? raw;
}

export function nameSizeFor(name: string, owner = false): CreatorHeroNameSize {
  const length = Array.from(name.trim()).length;
  const step = length <= 8 ? 0 : length <= 16 ? 1 : length <= 28 ? 2 : 3;
  return NAME_SIZES[Math.min(step + (owner ? 1 : 0), 3)]!;
}

export function lastStreamedLabel(
  value: string | null,
  now: Date,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.max(0, Math.round((day(now) - day(date)) / DAY_MS));
  if (days === 0) return "Streamed today";
  if (days === 1) return "Last streamed yesterday";
  if (days <= 30) return `Last streamed ${days}d ago`;
  return `Last streamed ${date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

function handleFor(username: string): string {
  const handle = username.trim();
  // A name with spaces is a channel title (common on YouTube), not a handle.
  if (!handle || /\s/.test(handle) || handle.startsWith("@")) return handle;
  return `@${handle}`;
}

function shareLabel(count: number, sum: number): string | null {
  if (sum <= 0) return null;
  const pct = (count / sum) * 100;
  if (count > 0 && pct < 0.1) return "<0.1%";
  return `${pct.toFixed(1)}%`;
}

export function buildCreatorHero(
  creator: CreatorHeroData,
  options: { owner?: boolean; now?: Date } = {},
): CreatorHeroModel {
  const counted = creator.platformAccounts.map((account) => ({
    account,
    count: toCount(account.followerCount),
  }));
  const sum = counted.reduce((total, item) => total + (item.count ?? 0), 0);
  const max = counted.reduce((top, item) => Math.max(top, item.count ?? 0), 0);

  const cells: CreatorHeroCell[] = counted
    .sort((a, b) => {
      if (a.count == null || b.count == null) {
        if (a.count != null) return -1;
        if (b.count != null) return 1;
      } else if (a.count !== b.count) {
        return b.count - a.count;
      }
      return (
        PLATFORM_DISPLAY_ORDER.indexOf(a.account.platform) -
        PLATFORM_DISPLAY_ORDER.indexOf(b.account.platform)
      );
    })
    .map(({ account, count }) => {
      const config = PLATFORM_CONFIG[account.platform];
      return {
        platform: account.platform,
        name: config.name,
        color: config.color,
        unit: account.platform === "youtube" ? "Subscribers" : "Followers",
        handle: handleFor(account.platformUsername),
        href: getPlatformProfileUrl(
          account.platform,
          account.platformUrl,
          account.platformUsername,
        ),
        display: count == null ? MISSING : formatNumber(count),
        missing: count == null,
        share: count == null ? null : shareLabel(count, sum),
        barPct:
          count == null || max <= 0
            ? null
            : count === 0
              ? 0
              : Math.max(2, (count / max) * 100),
      };
    });

  const mode =
    cells.length === 0 ? "none" : cells.length === 1 ? "single" : "multi";
  const only = cells[0];
  const everyCountMissing = cells.length > 0 && cells.every((c) => c.missing);
  const storedTotal = toCount(creator.totalFollowers) ?? 0;

  const bio = creator.bio?.trim() ?? "";
  const meta = [
    countryLabel(creator.country),
    creator.primaryGameName?.trim() || null,
    languageLabel(creator.language),
    creator.age ? `${creator.age} years old` : null,
  ].filter((part): part is string => Boolean(part));

  return {
    mode,
    cells,
    totalLabel:
      mode === "single" && only
        ? `${only.name} ${only.unit.toLowerCase()}`
        : "Total audience",
    total:
      mode === "single" && only
        ? only.display
        : everyCountMissing
          ? MISSING
          : formatNumber(storedTotal),
    nameSize: nameSizeFor(creator.displayName, options.owner),
    meta,
    lastStreamed: lastStreamedLabel(
      creator.lastStreamAt,
      options.now ?? new Date(),
    ),
    bioPreview: bio ? bio.replace(/\s+/g, " ") : null,
    hasFullBio:
      Array.from(bio).length > BIO_PREVIEW_MAX_CHARS || /[\r\n]/.test(bio),
  };
}
