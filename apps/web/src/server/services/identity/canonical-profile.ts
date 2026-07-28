/**
 * Resolve a profile record to the creator that owns its public identity.
 *
 * Platform accounts can remain on a merged redirect stub when the canonical
 * profile already has an account for the same platform. Identity consumers
 * must treat both records as belonging to the canonical creator.
 */
export function canonicalProfileId(profile: {
  id: string;
  mergedIntoId: string | null;
}): string {
  return profile.mergedIntoId ?? profile.id;
}
