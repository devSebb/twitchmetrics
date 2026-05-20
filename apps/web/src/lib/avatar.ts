/**
 * Single source of truth for "which avatar URL do we display?" Every render
 * site should call this rather than write its own fallback chain — the
 * priority rules differ between TMs (own upload first) and creators
 * (platform-connected avatar first).
 */

export type AvatarSources = {
  user?: { image?: string | null } | null;
  creator?: {
    avatarUrl?: string | null;
    customAvatarUrl?: string | null;
    platformAccounts?: Array<{ platformAvatarUrl?: string | null }> | null;
  } | null;
  manager?: { avatarUrl?: string | null } | null;
};

export function resolveAvatar(
  role: string | null | undefined,
  sources: AvatarSources,
): string | null {
  if (role === "talent_manager") {
    return (
      firstNonEmpty(sources.manager?.avatarUrl) ??
      firstNonEmpty(sources.user?.image) ??
      null
    );
  }

  // creator + admin + anything else fall through to the creator chain.
  const platformAvatar = sources.creator?.platformAccounts
    ?.map((account) => account.platformAvatarUrl)
    .find((value): value is string => Boolean(value && value.length > 0));

  return (
    firstNonEmpty(platformAvatar) ??
    firstNonEmpty(sources.creator?.avatarUrl) ??
    firstNonEmpty(sources.user?.image) ??
    firstNonEmpty(sources.creator?.customAvatarUrl) ??
    null
  );
}

function firstNonEmpty(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null;
}
