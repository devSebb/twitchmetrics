import path from "node:path";
import {
  Document,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Platform } from "@twitchmetrics/database";

// @react-pdf re-exports a Style type, but the package boundary on pnpm makes
// it unreliable to import. Derive it from a sentinel StyleSheet entry below.
type Style = (typeof styles)[keyof typeof styles];
import { PDF_DISPLAY_FONT_FAMILY, PDF_FONT_FAMILY } from "./fonts";

/**
 * Print-friendly palette. White paper + near-black ink. The TM's brand color
 * comes in via props and shows up as the cover bar, card stripes, and footer
 * accent — never as a background fill.
 */
const COLORS = {
  paper: "#FFFFFF",
  ink: "#1E1F22",
  inkMuted: "#6B7280",
  inkSoft: "#9CA3AF",
  hairline: "#E5E7EB",
  cardBg: "#FAFAFA",
  positive: "#16A34A",
  negative: "#DC2626",
} as const;

const PLATFORM_LABEL: Record<Platform, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  kick: "Kick",
};

const ICONS_DIR = path.join(process.cwd(), "public", "platform-icons");

const PLATFORM_ICON_PATH: Record<Platform, string> = {
  twitch: path.join(ICONS_DIR, "twitch.png"),
  youtube: path.join(ICONS_DIR, "youtube.png"),
  tiktok: path.join(ICONS_DIR, "tiktok.png"),
  instagram: path.join(ICONS_DIR, "instagram.png"),
  // x.png is the dark variant; reads on white paper. x_white.png would disappear.
  x: path.join(ICONS_DIR, "x.png"),
  kick: path.join(ICONS_DIR, "kick.png"),
};

// Kick's wordmark has no built-in outline → needs a green circle behind it on
// white paper, matching the on-screen PlatformIcon treatment.
const KICK_BRAND_GREEN = "#53FC18";

export type RosterReportPlatform = {
  platform: Platform;
  username: string | null;
  followerCount: number | null;
};

export type RosterReportCreator = {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  primaryPlatform: Platform | null;
  primaryUsername: string | null;
  platformBreakdown: readonly RosterReportPlatform[];
  totalFollowers: number;
  growth7dPct: number | null;
  topGame: string | null;
  profileUrl: string;
};

export type RosterReportProps = {
  manager: {
    displayName: string;
    agencyName: string | null;
    bio: string | null;
    avatarUrl: string | null;
  };
  brandColor: string;
  generatedAt: Date;
  summary: {
    totalCreators: number;
    totalFollowers: number;
    avgGrowthPct: number;
  };
  creators: readonly RosterReportCreator[];
  siteUrl: string;
};

const MAX_BREAKDOWN_ROWS = 4;

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.paper,
    color: COLORS.ink,
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 9,
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 40,
  },

  brandBarTop: { height: 8, marginHorizontal: -40, marginTop: -36 },

  coverHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 40,
    gap: 16,
  },
  coverAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    objectFit: "cover",
    backgroundColor: COLORS.hairline,
  },
  coverAvatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  coverAvatarFallbackText: {
    fontFamily: PDF_DISPLAY_FONT_FAMILY,
    fontSize: 28,
    color: COLORS.inkMuted,
  },
  coverEyebrow: {
    fontSize: 8,
    color: COLORS.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontWeight: 500,
  },
  coverHeadline: {
    fontFamily: PDF_DISPLAY_FONT_FAMILY,
    fontSize: 28,
    color: COLORS.ink,
    marginTop: 4,
  },
  coverSubhead: {
    fontSize: 10,
    color: COLORS.inkMuted,
    marginTop: 4,
  },
  coverBio: {
    fontSize: 10,
    color: COLORS.ink,
    marginTop: 28,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: COLORS.hairline,
  },

  kpiRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 32,
  },
  kpiCard: {
    flex: 1,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.hairline,
    borderRadius: 6,
    padding: 12,
    backgroundColor: COLORS.cardBg,
  },
  kpiLabel: {
    fontSize: 7,
    color: COLORS.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontWeight: 500,
  },
  kpiValue: {
    fontFamily: PDF_DISPLAY_FONT_FAMILY,
    fontSize: 20,
    color: COLORS.ink,
    marginTop: 6,
  },

  sectionHeading: {
    fontFamily: PDF_DISPLAY_FONT_FAMILY,
    fontSize: 16,
    color: COLORS.ink,
    marginTop: 28,
    marginBottom: 12,
  },

  // Roster grid
  gridRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.hairline,
    borderRadius: 6,
    padding: 12,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    objectFit: "cover",
    backgroundColor: COLORS.hairline,
  },
  cardAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  cardAvatarFallbackText: {
    fontFamily: PDF_DISPLAY_FONT_FAMILY,
    fontSize: 16,
    color: COLORS.inkMuted,
  },
  cardIdentity: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 11, fontWeight: 700, color: COLORS.ink },
  cardHandle: { fontSize: 8, color: COLORS.inkMuted, marginTop: 1 },

  cardStripe: { height: 2, marginTop: 10, borderRadius: 1 },

  // Headline metrics row: Total followers + Growth (7d)
  headlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 10,
  },
  headlineLabel: {
    fontSize: 7,
    color: COLORS.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: 500,
  },
  headlineValue: {
    fontFamily: PDF_DISPLAY_FONT_FAMILY,
    fontSize: 18,
    color: COLORS.ink,
    marginTop: 2,
  },
  headlineValuePositive: { color: COLORS.positive },
  headlineValueNegative: { color: COLORS.negative },
  headlineColRight: { alignItems: "flex-end" },

  // Section divider used for Platforms + Top Game blocks inside the card
  cardSection: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: COLORS.hairline,
  },
  cardSectionLabel: {
    fontSize: 7,
    color: COLORS.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: 500,
    marginBottom: 6,
  },

  // Per-platform breakdown row
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 3,
  },
  breakdownPlatformName: {
    flex: 1,
    fontSize: 9,
    color: COLORS.ink,
  },
  breakdownValue: {
    fontSize: 9,
    color: COLORS.ink,
    fontWeight: 500,
  },
  breakdownMore: {
    fontSize: 8,
    color: COLORS.inkMuted,
    marginTop: 2,
  },

  // Top game line
  topGameValue: { fontSize: 10, color: COLORS.ink },

  // Kick logo wrapper — green circle to make the wordmark legible on white
  kickWrapper: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: KICK_BRAND_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 8,
    color: COLORS.inkMuted,
  },
  footerBrand: {
    fontSize: 8,
    fontWeight: 500,
    color: "#2B2D31",
    textDecoration: "none",
  },
  footerStripe: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    height: 3,
  },
});

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-US");
}

function formatFollowerCount(value: number | null): string {
  if (value === null || value <= 0) return "—";
  return formatNumber(value);
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const rounded = value.toFixed(1);
  return value > 0 ? `+${rounded}%` : `${rounded}%`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function initials(name: string): string {
  return name.charAt(0).toUpperCase() || "?";
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function Footer({
  brandColor,
  siteUrl,
}: {
  brandColor: string;
  siteUrl: string;
}) {
  return (
    <>
      <View
        style={[styles.footerStripe, { backgroundColor: brandColor }]}
        fixed
      />
      <View style={styles.footer} fixed>
        <Link src={siteUrl} style={styles.footerBrand}>
          Powered by TwitchMetrics
        </Link>
        <Text
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
      </View>
    </>
  );
}

function Avatar({
  src,
  displayName,
  styleImg,
  styleFallback,
  styleFallbackText,
}: {
  src: string | null;
  displayName: string;
  styleImg: Style;
  styleFallback: Style;
  styleFallbackText: Style;
}) {
  // @react-pdf's <Image> does not accept an alt prop.
  // eslint-disable-next-line jsx-a11y/alt-text
  if (src) return <Image src={src} style={styleImg} />;
  return (
    <View style={styleFallback}>
      <Text style={styleFallbackText}>{initials(displayName)}</Text>
    </View>
  );
}

function PlatformLogo({
  platform,
  size = 11,
}: {
  platform: Platform;
  size?: number;
}) {
  const src = PLATFORM_ICON_PATH[platform];

  // Kick: nest the smaller wordmark inside a green-bordered circle so the
  // logo doesn't visually disappear against white paper.
  if (platform === "kick") {
    const inner = Math.round(size * 0.62);
    return (
      <View
        style={[
          styles.kickWrapper,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={src} style={{ width: inner, height: inner }} />
      </View>
    );
  }

  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image src={src} style={{ width: size, height: size }} />;
}

function CreatorCard({
  creator,
  brandColor,
}: {
  creator: RosterReportCreator;
  brandColor: string;
}) {
  const growth = creator.growth7dPct;
  const growthStyle =
    growth === null
      ? styles.headlineValue
      : growth > 0
        ? [styles.headlineValue, styles.headlineValuePositive]
        : growth < 0
          ? [styles.headlineValue, styles.headlineValueNegative]
          : styles.headlineValue;

  const visibleBreakdown = creator.platformBreakdown.slice(
    0,
    MAX_BREAKDOWN_ROWS,
  );
  const hiddenCount =
    creator.platformBreakdown.length - visibleBreakdown.length;

  return (
    <Link
      src={creator.profileUrl}
      style={[styles.card, { textDecoration: "none", color: COLORS.ink }]}
    >
      {/* Identity row */}
      <View style={styles.cardTop}>
        <Avatar
          src={creator.avatarUrl}
          displayName={creator.displayName}
          styleImg={styles.cardAvatar}
          styleFallback={styles.cardAvatarFallback}
          styleFallbackText={styles.cardAvatarFallbackText}
        />
        <View style={styles.cardIdentity}>
          <Text style={styles.cardName}>{creator.displayName}</Text>
          {creator.primaryUsername ? (
            <Text style={styles.cardHandle}>@{creator.primaryUsername}</Text>
          ) : null}
        </View>
      </View>

      {/* Brand-color accent */}
      <View style={[styles.cardStripe, { backgroundColor: brandColor }]} />

      {/* Headline metrics: Total followers + Growth (7d) */}
      <View style={styles.headlineRow}>
        <View>
          <Text style={styles.headlineLabel}>Total followers</Text>
          <Text style={styles.headlineValue}>
            {formatNumber(creator.totalFollowers)}
          </Text>
        </View>
        <View style={styles.headlineColRight}>
          <Text style={styles.headlineLabel}>Growth (7d)</Text>
          <Text style={growthStyle}>{formatPercent(creator.growth7dPct)}</Text>
        </View>
      </View>

      {/* Per-platform breakdown */}
      {visibleBreakdown.length > 0 ? (
        <View style={styles.cardSection}>
          <Text style={styles.cardSectionLabel}>Platforms</Text>
          {visibleBreakdown.map((entry) => (
            <View key={entry.platform} style={styles.breakdownRow}>
              <PlatformLogo platform={entry.platform} size={11} />
              <Text style={styles.breakdownPlatformName}>
                {PLATFORM_LABEL[entry.platform]}
              </Text>
              <Text style={styles.breakdownValue}>
                {formatFollowerCount(entry.followerCount)}
              </Text>
            </View>
          ))}
          {hiddenCount > 0 ? (
            <Text style={styles.breakdownMore}>
              + {hiddenCount} more platform{hiddenCount === 1 ? "" : "s"}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Top game */}
      {creator.topGame ? (
        <View style={styles.cardSection}>
          <Text style={styles.cardSectionLabel}>Top game</Text>
          <Text style={styles.topGameValue}>{creator.topGame}</Text>
        </View>
      ) : null}
    </Link>
  );
}

export function RosterReport(props: RosterReportProps) {
  const managerLabel = props.manager.agencyName ?? props.manager.displayName;
  const rows = chunk(props.creators, 2);

  return (
    <Document
      title={`${managerLabel} — Roster`}
      author={managerLabel}
      creator="TwitchMetrics"
      producer="TwitchMetrics"
    >
      {/* Single flowing page — @react-pdf paginates automatically when the
          content overflows. Rows declare wrap={false} so the grid never splits
          a row of cards across pages. */}
      <Page size="A4" style={styles.page}>
        <View
          style={[styles.brandBarTop, { backgroundColor: props.brandColor }]}
        />

        <View style={styles.coverHeader}>
          <Avatar
            src={props.manager.avatarUrl}
            displayName={managerLabel}
            styleImg={styles.coverAvatar}
            styleFallback={styles.coverAvatarFallback}
            styleFallbackText={styles.coverAvatarFallbackText}
          />
          <View>
            <Text style={styles.coverEyebrow}>Talent Roster</Text>
            <Text style={styles.coverHeadline}>{managerLabel}</Text>
            <Text style={styles.coverSubhead}>
              {formatDate(props.generatedAt)} · {props.summary.totalCreators}{" "}
              creators
            </Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total reach</Text>
            <Text style={styles.kpiValue}>
              {formatNumber(props.summary.totalFollowers)}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Avg growth (7d)</Text>
            <Text style={styles.kpiValue}>
              {formatPercent(props.summary.avgGrowthPct)}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Active creators</Text>
            <Text style={styles.kpiValue}>{props.summary.totalCreators}</Text>
          </View>
        </View>

        {props.manager.bio ? (
          <Text style={styles.coverBio}>“{props.manager.bio}”</Text>
        ) : null}

        {/* Roster heading + first row stay glued together so the heading
            never lands alone at the bottom of a page. */}
        {rows.length === 0 ? (
          <View wrap={false}>
            <Text style={styles.sectionHeading}>Roster</Text>
            <Text style={styles.cardHandle}>
              No active creators to display.
            </Text>
          </View>
        ) : (
          <>
            <View wrap={false}>
              <Text style={styles.sectionHeading}>Roster</Text>
              <View style={styles.gridRow}>
                {rows[0]!.map((creator) => (
                  <CreatorCard
                    key={creator.slug}
                    creator={creator}
                    brandColor={props.brandColor}
                  />
                ))}
                {rows[0]!.length === 1 ? <View style={{ flex: 1 }} /> : null}
              </View>
            </View>
            {rows.slice(1).map((row, rowIndex) => (
              <View key={rowIndex} style={styles.gridRow} wrap={false}>
                {row.map((creator) => (
                  <CreatorCard
                    key={creator.slug}
                    creator={creator}
                    brandColor={props.brandColor}
                  />
                ))}
                {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
              </View>
            ))}
          </>
        )}

        <Footer brandColor={props.brandColor} siteUrl={props.siteUrl} />
      </Page>
    </Document>
  );
}
