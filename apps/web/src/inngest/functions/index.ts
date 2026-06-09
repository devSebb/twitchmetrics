import { tier1Snapshot } from "./snapshots/tier1-snapshot";
import { tier2Snapshot } from "./snapshots/tier2-snapshot";
import { tier3Snapshot } from "./snapshots/tier3-snapshot";
import { gameSnapshot } from "./snapshots/game-snapshot";
import { kickChannelSnapshot } from "./snapshots/kick-channel-snapshot";
import {
  kickCategoryDiscovery,
  kickCategorySnapshot,
} from "./snapshots/kick-category-snapshot";
import {
  streamHatchetGameDiscoverySnapshot,
  streamHatchetLiveChannelsSnapshot,
  streamHatchetLiveGamesSnapshot,
} from "./snapshots/streamhatchet-game-snapshot";
import { streamHatchetS3DailySessions } from "./snapshots/streamhatchet-s3-daily-sessions";
import { demoteInactiveCreators } from "./snapshots/demote-inactive";
import { onConnectSnapshot } from "./snapshots/on-connect-snapshot";
import { processClaim } from "./claims/process-claim";
import { verifyChallenge } from "./claims/verify-challenge";
import { refreshTokens } from "./tokens/refresh-tokens";
import { enrichClaimedProfiles } from "./enrichment/enrich-claimed-profiles";
import { enrichOnClaim } from "./enrichment/enrich-on-claim";
import { enrichGames } from "./enrichment/enrich-games";
import { enrichCreators } from "./enrichment/enrich-creators";
import { discoverCreators } from "./discovery/discover-creators";
import { discoverGames } from "./discovery/discover-games";
import { discoverSocialLinks } from "./discovery/discover-social-links";
import { youtubeCrosslinkBackfill } from "./discovery/youtube-crosslink-backfill";

export const functions = [
  tier1Snapshot,
  tier2Snapshot,
  tier3Snapshot,
  gameSnapshot,
  kickChannelSnapshot,
  kickCategoryDiscovery,
  kickCategorySnapshot,
  streamHatchetGameDiscoverySnapshot,
  streamHatchetLiveChannelsSnapshot,
  streamHatchetLiveGamesSnapshot,
  streamHatchetS3DailySessions,
  demoteInactiveCreators,
  onConnectSnapshot,
  processClaim,
  verifyChallenge,
  refreshTokens,
  enrichClaimedProfiles,
  enrichOnClaim,
  enrichGames,
  enrichCreators,
  discoverCreators,
  discoverGames,
  discoverSocialLinks,
  youtubeCrosslinkBackfill,
];
