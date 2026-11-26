/**
 * Accounts Stream Hatchet groups under a creator's contact that belong to
 * someone else.
 *
 * Its contact for the small YouTube channel "Adobe Basics" also holds
 * @instagram (686M), which put Adobe Basics on top of the Instagram tab; the
 * contact of YouTube itself holds the gaming channel @jessetc, which gave that
 * creator YouTube's X account and 46.8M "other channel" subscribers (team
 * review, 2026-11-25). Neither the social links nor the other-channels total
 * may take such accounts.
 *
 * An account is compared with the channels we track on the creator's own
 * profile. Links this job attached earlier do not count, nor do channels that
 * reached the profile through a contact merge: either may be the stranger
 * (TIME's YouTube channel was merged into the small channel YNGAMING).
 * It is an outsider when its handle shares nothing with theirs, nor with the
 * contact's name when that name is the creator's (the Dallas Mavericks contact
 * holds @mavericks and dallasmavs). A contact has
 * strangers when an outsider of SUSPECT_MIN_REACH or more is either
 *   - over SUSPECT_RATIO times the creator's largest tracked channel, or
 *   - over SUSPECT_CLUSTER_RATIO times it and carries the same handle as an
 *     outsider on another platform: a second identity, bigger than ours.
 * Then every outsider of the contact is dropped, so the stranger's smaller
 * accounts do not stay behind.
 */

export const SUSPECT_MIN_REACH = 1_000_000;
export const SUSPECT_RATIO = 100;
export const SUSPECT_CLUSTER_RATIO = 10;

export type ContactAccount = {
  platform: string;
  username: string | null;
  reach: number | null;
  /** A channel we track on the creator's own profile: not a link attached
   * by this job, not one that came in through a merge. */
  tracked: boolean;
};

export type StrangerReason = "ratio" | "second-identity";

/** True when two handles or names share four consecutive letters or digits. */
export function handlesOverlap(a: string | null, b: string | null): boolean {
  const norm = (value: string | null) =>
    (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  // A three-letter handle counts when the other one contains it (zhc and
  // zhcyt); anything shorter must be equal.
  if (x.length < 4 || y.length < 4) {
    const [short, long] = x.length <= y.length ? [x, y] : [y, x];
    return short.length === 3 ? long.includes(short) : x === y;
  }
  for (let i = 0; i + 4 <= x.length; i++) {
    if (y.includes(x.slice(i, i + 4))) return true;
  }
  return false;
}

/** False for an empty handle or a bare YouTube channel id (UC…). */
function hasName(username: string | null): boolean {
  return Boolean(username) && !/^UC[\w-]{22}$/.test(username as string);
}

/**
 * The contact's accounts that belong to someone else, with the rule that
 * found them. Empty when the contact looks like one creator, or when we track
 * no channel to compare with.
 */
export function findStrangers<T extends ContactAccount>(
  members: readonly T[],
  contactName: string | null = null,
): { strangers: T[]; reason: StrangerReason | null; ownMax: number } {
  const tracked = members.filter((m) => m.tracked);
  const ownMax = Math.max(1, ...tracked.map((m) => m.reach ?? 0));
  // Only accounts with a real handle can be compared: the export gives some
  // YouTube channels nothing but their channel id.
  const own = tracked.filter((m) => hasName(m.username));
  if (own.length === 0) return { strangers: [], reason: null, ownMax };

  // The contact's name vouches for an account only when it is the creator's
  // own name: YouTube's contact must not vouch for @youtube on a profile of
  // ours that it merely contains.
  const ownName =
    contactName && own.some((o) => handlesOverlap(contactName, o.username))
      ? contactName
      : null;
  const outsiders = members.filter(
    (m) =>
      !m.tracked &&
      hasName(m.username) &&
      !own.some((o) => handlesOverlap(m.username, o.username)) &&
      !(ownName && handlesOverlap(m.username, ownName)),
  );
  let reason: StrangerReason | null = null;
  for (const m of outsiders) {
    const reach = m.reach ?? 0;
    if (reach < SUSPECT_MIN_REACH) continue;
    if (reach > SUSPECT_RATIO * ownMax) {
      reason = "ratio";
      break;
    }
    if (
      reach > SUSPECT_CLUSTER_RATIO * ownMax &&
      outsiders.some(
        (o) =>
          o.platform !== m.platform && handlesOverlap(o.username, m.username),
      )
    ) {
      reason = "second-identity";
    }
  }
  return { strangers: reason ? outsiders : [], reason, ownMax };
}
