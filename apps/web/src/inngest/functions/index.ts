import { tier1Snapshot } from "./snapshots/tier1-snapshot";
import { tier2Snapshot } from "./snapshots/tier2-snapshot";
import { tier3Snapshot } from "./snapshots/tier3-snapshot";
import { gameSnapshot } from "./snapshots/game-snapshot";
import { demoteInactiveCreators } from "./snapshots/demote-inactive";
import { processClaim } from "./claims/process-claim";
import { verifyChallenge } from "./claims/verify-challenge";
import { refreshTokens } from "./tokens/refresh-tokens";
import { enrichClaimedProfiles } from "./enrichment/enrich-claimed-profiles";
import { enrichOnClaim } from "./enrichment/enrich-on-claim";

export const functions = [
  tier1Snapshot,
  tier2Snapshot,
  tier3Snapshot,
  gameSnapshot,
  demoteInactiveCreators,
  processClaim,
  verifyChallenge,
  refreshTokens,
  enrichClaimedProfiles,
  enrichOnClaim,
];
