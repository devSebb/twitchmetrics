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

const PLATFORM_ABBR: Record<Platform, string> = {
  twitch: "T",
  youtube: "Y",
  tiktok: "TT",
  instagram: "IG",
  x: "X",
  kick: "K",
};

const PLATFORM_COLOR: Record<Platform, string> = {
  twitch: "#9146FF",
  youtube: "#FF0000",
  tiktok: "#000000",
  instagram: "#E4405F",
  x: "#000000",
  kick: "#53FC18",
};

export type RosterReportCreator = {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  primaryPlatform: Platform | null;
  primaryUsername: string | null;
  connectedPlatforms: Platform[];
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

const CREATORS_PER_PAGE = 6;

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
  brandBarBottom: { height: 4, marginHorizontal: -40 },

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
    fontStyle: "italic",
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
    marginBottom: 16,
  },

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
    padding: 10,
    minHeight: 130,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    objectFit: "cover",
    backgroundColor: COLORS.hairline,
  },
  cardAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  cardAvatarFallbackText: {
    fontFamily: PDF_DISPLAY_FONT_FAMILY,
    fontSize: 14,
    color: COLORS.inkMuted,
  },
  cardName: { fontSize: 11, fontWeight: 700, color: COLORS.ink },
  cardHandle: { fontSize: 8, color: COLORS.inkMuted, marginTop: 1 },

  cardStripe: { height: 2, marginTop: 8 },

  platformRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 8,
    flexWrap: "wrap",
  },
  platformChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    fontSize: 7,
    color: COLORS.paper,
    fontWeight: 700,
  },

  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  statLabel: { fontSize: 8, color: COLORS.inkMuted },
  statValue: { fontSize: 9, fontWeight: 500, color: COLORS.ink },
  statValuePositive: { color: COLORS.positive },
  statValueNegative: { color: COLORS.negative },

  topGameWrapper: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: COLORS.hairline,
  },
  topGameLabel: {
    fontSize: 7,
    color: COLORS.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  topGameValue: { fontSize: 9, color: COLORS.ink, marginTop: 2 },

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
    color: "#2B2D31", // app main bg color, reads as dark gray on paper
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
  pageNumber,
  pageCount,
}: {
  brandColor: string;
  siteUrl: string;
  pageNumber: number;
  pageCount: number;
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
        <Text>
          Page {pageNumber} of {pageCount}
        </Text>
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
      ? styles.statValue
      : growth > 0
        ? [styles.statValue, styles.statValuePositive]
        : growth < 0
          ? [styles.statValue, styles.statValueNegative]
          : styles.statValue;

  return (
    <Link
      src={creator.profileUrl}
      style={[styles.card, { textDecoration: "none", color: COLORS.ink }]}
    >
      <View style={styles.cardTop}>
        <Avatar
          src={creator.avatarUrl}
          displayName={creator.displayName}
          styleImg={styles.cardAvatar}
          styleFallback={styles.cardAvatarFallback}
          styleFallbackText={styles.cardAvatarFallbackText}
        />
        <View>
          <Text style={styles.cardName}>{creator.displayName}</Text>
          {creator.primaryUsername ? (
            <Text style={styles.cardHandle}>@{creator.primaryUsername}</Text>
          ) : null}
        </View>
      </View>

      <View style={[styles.cardStripe, { backgroundColor: brandColor }]} />

      {creator.connectedPlatforms.length > 0 ? (
        <View style={styles.platformRow}>
          {creator.connectedPlatforms.map((platform) => (
            <Text
              key={platform}
              style={[
                styles.platformChip,
                { backgroundColor: PLATFORM_COLOR[platform] },
              ]}
            >
              {PLATFORM_ABBR[platform]}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.statRow}>
        <Text style={styles.statLabel}>Followers</Text>
        <Text style={styles.statValue}>
          {formatNumber(creator.totalFollowers)}
        </Text>
      </View>
      <View style={styles.statRow}>
        <Text style={styles.statLabel}>Growth (7d)</Text>
        <Text style={growthStyle}>{formatPercent(creator.growth7dPct)}</Text>
      </View>

      {creator.topGame ? (
        <View style={styles.topGameWrapper}>
          <Text style={styles.topGameLabel}>Top game</Text>
          <Text style={styles.topGameValue}>{creator.topGame}</Text>
        </View>
      ) : null}
    </Link>
  );
}

export function RosterReport(props: RosterReportProps) {
  const pages = chunk(props.creators, CREATORS_PER_PAGE);
  const totalPages = 1 + Math.max(pages.length, 1);
  const managerLabel = props.manager.agencyName ?? props.manager.displayName;

  return (
    <Document
      title={`${managerLabel} — Roster`}
      author={managerLabel}
      creator="TwitchMetrics"
      producer="TwitchMetrics"
    >
      {/* Cover */}
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

        <Footer
          brandColor={props.brandColor}
          siteUrl={props.siteUrl}
          pageNumber={1}
          pageCount={totalPages}
        />
      </Page>

      {/* Roster pages */}
      {pages.length === 0 ? (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionHeading}>Roster</Text>
          <Text style={styles.cardHandle}>No active creators to display.</Text>
          <Footer
            brandColor={props.brandColor}
            siteUrl={props.siteUrl}
            pageNumber={2}
            pageCount={totalPages}
          />
        </Page>
      ) : (
        pages.map((pageCreators, pageIndex) => (
          <Page key={pageIndex} size="A4" style={styles.page}>
            <Text style={styles.sectionHeading}>
              Roster{pageIndex > 0 ? " (continued)" : ""}
            </Text>
            {chunk(pageCreators, 2).map((row, rowIndex) => (
              <View key={rowIndex} style={styles.gridRow}>
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
            <Footer
              brandColor={props.brandColor}
              siteUrl={props.siteUrl}
              pageNumber={pageIndex + 2}
              pageCount={totalPages}
            />
          </Page>
        ))
      )}
    </Document>
  );
}
