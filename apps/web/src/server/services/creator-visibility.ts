import { Prisma, type PrismaClient } from "@twitchmetrics/database";

/**
 * Public discovery is intentionally narrower than direct access or lookup.
 * These profiles may appear in directories, trending modules, and sitemaps.
 */
export const DISCOVERABLE_CREATOR_WHERE = {
  listed: true,
  mergedIntoId: null,
} satisfies Prisma.CreatorProfileWhereInput;

/**
 * Intent-driven lookup keeps unlisted profiles findable while removing merge
 * redirect stubs from search results.
 */
export const LOOKUP_CREATOR_WHERE = {
  mergedIntoId: null,
} satisfies Prisma.CreatorProfileWhereInput;

// Raw-query equivalents. Public creator SQL consistently aliases the profile
// table as `cp`; keeping these fragments here prevents policy drift.
export const DISCOVERABLE_CREATOR_SQL = Prisma.sql`
  cp."listed" = true AND cp."mergedIntoId" IS NULL
`;

export const LOOKUP_CREATOR_SQL = Prisma.sql`
  cp."mergedIntoId" IS NULL
`;

/** A merge must never make an already-discoverable identity disappear. */
export function listedAfterMerge(
  canonicalListed: boolean,
  absorbedListed: boolean,
): boolean {
  return canonicalListed || absorbedListed;
}

export function creatorRobots(listed: boolean) {
  return listed
    ? { index: true, follow: true }
    : { index: false, follow: true };
}

export async function resolveCreatorSlug(
  prisma: PrismaClient,
  slug: string,
): Promise<
  | { found: false }
  | {
      found: true;
      id: string;
      listed: boolean;
      canonicalSlug: string;
      redirect: boolean;
    }
> {
  const profile = await prisma.creatorProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      listed: true,
      mergedInto: { select: { id: true, slug: true, listed: true } },
    },
  });

  if (!profile) return resolveSlugRedirect(prisma, slug);
  if (profile.mergedInto) {
    return {
      found: true,
      id: profile.mergedInto.id,
      listed: profile.mergedInto.listed,
      canonicalSlug: profile.mergedInto.slug,
      redirect: true,
    };
  }

  return {
    found: true,
    id: profile.id,
    listed: profile.listed,
    canonicalSlug: profile.slug,
    redirect: false,
  };
}

/**
 * Renamed slugs (e.g. the machine-slug cleanup) leave a SlugRedirect row
 * behind so old links keep resolving. A redirect always reports
 * redirect: true so callers issue a permanent redirect to the canonical slug;
 * if the target itself was merged, we follow the merge pointer one hop.
 */
async function resolveSlugRedirect(
  prisma: PrismaClient,
  slug: string,
): Promise<Awaited<ReturnType<typeof resolveCreatorSlug>>> {
  let redirect;
  try {
    redirect = await prisma.slugRedirect.findUnique({
      where: { oldSlug: slug },
      select: {
        creatorProfile: {
          select: {
            id: true,
            slug: true,
            listed: true,
            mergedInto: { select: { id: true, slug: true, listed: true } },
          },
        },
      },
    });
  } catch (error) {
    // P2021: SlugRedirect table not migrated yet — behave as a plain miss.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2021"
    ) {
      return { found: false };
    }
    throw error;
  }

  if (!redirect) return { found: false };
  const target = redirect.creatorProfile.mergedInto ?? redirect.creatorProfile;
  return {
    found: true,
    id: target.id,
    listed: target.listed,
    canonicalSlug: target.slug,
    redirect: true,
  };
}
