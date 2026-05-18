/**
 * The dual permission invariant for every roster-gated read.
 *
 * A TalentManagerAccess row only grants the manager analytics / private detail /
 * export / brand reads when BOTH conditions hold:
 *   - status === "active"   (the creator explicitly accepted the invitation)
 *   - revokedAt === null    (the manager hasn't been removed)
 *
 * Pending and declined rows must never satisfy this filter. Use this constant
 * (or `isActiveRosterAccess`) on every read of TalentManagerAccess; the only
 * legitimate exceptions are:
 *   - talentManager.getRoster        (intentionally fetches pending + active)
 *   - rosterInvite.listForCurrentUser (intentionally fetches pending only)
 *
 * Both opt-outs carry an inline comment explaining the exception.
 */
export const ROSTER_ACTIVE_FILTER = {
  status: "active" as const,
  revokedAt: null,
} as const;

export function isActiveRosterAccess(row: {
  status: "pending" | "active" | "declined";
  revokedAt: Date | null;
}): boolean {
  return row.status === "active" && row.revokedAt === null;
}
