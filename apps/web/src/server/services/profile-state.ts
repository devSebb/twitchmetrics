import {
  prisma,
  type ProfileState,
  type SnapshotTier,
} from "@twitchmetrics/database";
import { getTierForCreator } from "@/lib/constants/tiers";

type StateTransition = {
  from: ProfileState;
  to: ProfileState;
  reason: string;
};

const VALID_TRANSITIONS: StateTransition[] = [
  { from: "unclaimed", to: "pending_claim", reason: "Claim initiated" },
  { from: "pending_claim", to: "claimed", reason: "Claim approved" },
  {
    from: "pending_claim",
    to: "unclaimed",
    reason: "Claim rejected or expired",
  },
  { from: "claimed", to: "premium", reason: "Subscription activated" },
  { from: "premium", to: "claimed", reason: "Subscription lapsed" },
];

export class InvalidStateTransitionError extends Error {
  constructor(from: ProfileState, to: ProfileState) {
    super(`Invalid profile state transition: ${from} -> ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}

function hasValidTransition(from: ProfileState, to: ProfileState): boolean {
  return VALID_TRANSITIONS.some((transition) => {
    return transition.from === from && transition.to === to;
  });
}

function ensureMinimumClaimedTier(tier: SnapshotTier): SnapshotTier {
  if (tier === "tier3") return "tier2";
  return tier;
}

type TransitionOptions = {
  ownerUserId?: string | null;
};

export async function transitionProfileState(
  creatorProfileId: string,
  toState: ProfileState,
  triggeredBy: string,
  options?: TransitionOptions,
): Promise<void> {
  const current = await prisma.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    select: {
      id: true,
      state: true,
      totalFollowers: true,
    },
  });

  if (!current) {
    throw new Error("Creator profile not found");
  }

  if (!hasValidTransition(current.state, toState)) {
    throw new InvalidStateTransitionError(current.state, toState);
  }

  const updateData: {
    state: ProfileState;
    claimedAt?: Date | null;
    userId?: string | null;
    snapshotTier?: SnapshotTier;
  } = {
    state: toState,
  };

  if (toState === "claimed") {
    updateData.claimedAt = new Date();
    updateData.userId =
      options?.ownerUserId ?? (triggeredBy === "system" ? null : triggeredBy);
    updateData.snapshotTier = ensureMinimumClaimedTier(
      getTierForCreator(current.totalFollowers),
    );
  }

  if (toState === "unclaimed") {
    updateData.claimedAt = null;
    updateData.userId = null;
  }

  await prisma.creatorProfile.update({
    where: { id: creatorProfileId },
    data: updateData,
  });
}
