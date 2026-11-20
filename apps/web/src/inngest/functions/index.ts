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
import { streamHatchetCreatorRollups } from "./snapshots/streamhatchet-creator-rollups";
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
import { finalizeStaleIngestionRuns } from "./maintenance/finalize-stale-runs";
import { githubJobsWatchdog } from "./maintenance/github-jobs-watchdog";

/**
 * What Inngest runs (served by /api/inngest). Everything Inngest shows in
 * its dashboard comes from this list.
 */
export const functions = [
  // App events: someone is waiting on these.
  processClaim,
  verifyChallenge,
  enrichOnClaim,
  onConnectSnapshot,
  // Crons that stay here: token refresh needs every OAuth client secret,
  // and the watchdog checks the GitHub jobs so it can't run on GitHub.
  refreshTokens,
  githubJobsWatchdog,
  // Manual tools, started by sending their event from the Inngest dashboard.
  discoverSocialLinks,
  youtubeCrosslinkBackfill,
];

/**
 * Cron jobs that run on GitHub Actions (.github/workflows/scheduled-jobs.yml
 * and creator-snapshots.yml), through workers/run-job.ts. Not registered
 * with Inngest: they are Inngest function objects only so the runner can
 * call the same handler. The SH daily import and creator rollups are here
 * for the same reason: sh-daily-sessions.yml does that work.
 */
export const githubFunctions = [
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
  streamHatchetCreatorRollups,
  demoteInactiveCreators,
  enrichClaimedProfiles,
  enrichGames,
  enrichCreators,
  discoverCreators,
  discoverGames,
  finalizeStaleIngestionRuns,
];
