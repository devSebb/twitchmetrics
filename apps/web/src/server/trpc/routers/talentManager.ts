import { z } from "zod";
import { Platform, Prisma } from "@twitchmetrics/database";
import { TRPCError } from "@trpc/server";
import { talentManagerProcedure } from "../middleware";
import { router } from "../root";
import { ROSTER_ACTIVE_FILTER } from "@/server/services/roster-access";
import {
  buildInviteUrl,
  checkRateLimit,
  generateInviteToken,
  inviteCreationLimiter,
} from "@/server/services/roster-invite";
import { logAudit } from "@/server/services/audit";

const permissionsSchema = z
  .object({
    canViewAnalytics: z.boolean().default(true),
    canEditProfile: z.boolean().default(false),
    canExportData: z.boolean().default(false),
    canManageBrands: z.boolean().default(false),
  })
  .optional();

type InviteCreatorResult =
  | {
      kind: "created";
      accessId: string;
      inviteUrl: string;
      expiresAt: Date;
      profileWasClaimed: boolean;
    }
  | {
      kind: "pending_exists";
      accessId: string;
      inviteExpiresAt: Date | null;
      profileWasClaimed: boolean;
    }
  | { kind: "already_active"; accessId: string };

// ─── Manager profile schemas ───
//
// Optional + nullable on every field: the form sends partial updates, and
// clearing a field sends null (so the user can wipe a value). The mutation
// only writes keys that are actually present in the input.

const tmProfileUpdateSchema = z.object({
  agencyName: z.string().trim().max(80).nullable().optional(),
  bio: z.string().trim().max(280).nullable().optional(),
  websiteUrl: z
    .string()
    .trim()
    .url()
    .max(200)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  country: z.string().trim().max(60).nullable().optional(),
  languages: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  contactEmail: z
    .string()
    .trim()
    .email()
    .max(200)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

export const talentManagerRouter = router({
  /**
   * Read the calling manager's profile. Upserts on read so a TM that
   * predates the schema (or somehow missed the onboarding seed) always
   * gets a row to edit.
   */
  getMyProfile: talentManagerProcedure.query(async ({ ctx }) => {
    const profile = await ctx.prisma.talentManagerProfile.upsert({
      where: { userId: ctx.user.id },
      create: { userId: ctx.user.id },
      update: {},
    });
    return profile;
  }),

  /**
   * Update the calling manager's profile. Partial update — only writes
   * keys present in the input. Suspended managers are blocked even though
   * the route is read-mostly; consistent with other write paths in this
   * router.
   */
  updateMyProfile: talentManagerProcedure
    .input(tmProfileUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.suspended) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your account is suspended.",
        });
      }

      const data: Prisma.TalentManagerProfileUpdateInput = {};
      if (input.agencyName !== undefined) data.agencyName = input.agencyName;
      if (input.bio !== undefined) data.bio = input.bio;
      if (input.websiteUrl !== undefined) data.websiteUrl = input.websiteUrl;
      if (input.country !== undefined) data.country = input.country;
      if (input.languages !== undefined) data.languages = input.languages;
      if (input.contactEmail !== undefined)
        data.contactEmail = input.contactEmail;

      const updated = await ctx.prisma.talentManagerProfile.update({
        where: { userId: ctx.user.id },
        data,
      });

      logAudit({
        userId: ctx.user.id,
        action: "tmProfile.updated",
        targetType: "talentManagerProfile",
        targetId: updated.id,
        metadata: { changedKeys: Object.keys(data) },
      });

      return updated;
    }),

  /**
   * Search creator profiles eligible for invitation.
   *
   * Mirrors the navbar SearchBar (apps/web/src/app/api/search/route.ts) — uses
   * pg_trgm similarity on CreatorProfile.searchText for fuzzy matching, plus
   * ILIKE substring as a fallback. The prior `contains` on three columns
   * missed creators the navbar finds easily.
   *
   * Bug fix: previously used Prisma's `NOT: { userId: ctx.user.id }`, which
   * SQL three-valued logic turns into "exclude null userId too" — so every
   * unclaimed profile got filtered out. The explicit `userId IS NULL OR
   * userId != $self` predicate handles NULL correctly.
   *
   * Returns `isClaimed: boolean` (computed server-side) instead of `userId` —
   * leaking another creator's user id to the client is unnecessary.
   */
  searchCreators: talentManagerProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      if (q.length === 0) return [];

      type Row = {
        id: string;
        displayName: string;
        slug: string;
        avatarUrl: string | null;
        state: string;
        totalFollowers: bigint;
        primaryPlatform: Platform | null;
        userId: string | null;
        relevance: number;
      };

      const rows = await ctx.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT
          cp.id,
          cp."displayName",
          cp.slug,
          cp."avatarUrl",
          cp.state::text AS state,
          cp."totalFollowers",
          cp."primaryPlatform",
          cp."userId",
          similarity(cp."searchText", ${q}) AS relevance
        FROM "CreatorProfile" cp
        WHERE cp.state IN ('unclaimed', 'claimed', 'premium')
          AND (cp."userId" IS NULL OR cp."userId" != ${ctx.user.id}::uuid)
          AND (
            cp."searchText" % ${q}
            OR cp."searchText" ILIKE '%' || ${q} || '%'
          )
        ORDER BY relevance DESC, cp."totalFollowers" DESC
        LIMIT 8
      `);

      return rows.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        slug: r.slug,
        avatarUrl: r.avatarUrl,
        state: r.state,
        totalFollowers: r.totalFollowers ? String(r.totalFollowers) : "0",
        primaryPlatform: r.primaryPlatform,
        isClaimed: r.userId !== null,
      }));
    }),

  /**
   * Manager's roster — intentionally fetches both pending and active rows.
   * Pending rows surface public-only data; active rows surface the full creator
   * payload. Permissions on pending rows are zeroed defensively. Each row
   * carries a computed `inviteState` ("active" | "pending" | "expired").
   *
   * Expired pending rows are intentionally included so managers can regenerate
   * or cancel them. The bell (rosterInvite.listForCurrentUser) filters them.
   */
  getRoster: talentManagerProcedure.query(async ({ ctx }) => {
    // Intentionally fetches pending+active for the roster UI. Pending rows are
    // sanitized in the response below (permissions zeroed). Active reads still
    // gate through ROSTER_ACTIVE_FILTER elsewhere.
    const rows = await ctx.prisma.talentManagerAccess.findMany({
      where: {
        managerId: ctx.user.id,
        revokedAt: null,
        status: { in: ["active", "pending"] },
      },
      include: {
        creatorProfile: {
          select: {
            id: true,
            displayName: true,
            slug: true,
            avatarUrl: true,
            primaryPlatform: true,
            totalFollowers: true,
            totalViews: true,
            state: true,
            lastSnapshotAt: true,
            platformAccounts: {
              select: {
                platform: true,
                platformUsername: true,
                followerCount: true,
              },
            },
            growthRollups: {
              select: {
                platform: true,
                delta7d: true,
                pct7d: true,
                trendDirection: true,
              },
            },
          },
        },
      },
      orderBy: { grantedAt: "desc" },
    });

    const now = Date.now();

    const mapped = rows.map((a) => {
      const isActive = a.status === "active";
      const isExpired =
        !isActive &&
        a.inviteExpiresAt !== null &&
        a.inviteExpiresAt.getTime() < now;
      const inviteState: "active" | "pending" | "expired" = isActive
        ? "active"
        : isExpired
          ? "expired"
          : "pending";

      return {
        accessId: a.id,
        status: a.status,
        inviteState,
        inviteExpiresAt: a.inviteExpiresAt,
        acceptedAt: a.acceptedAt,
        grantedAt: a.grantedAt,
        // Permissions are zeroed for pending rows — the UI must never trust them
        // until accepted, and the server already gates analytics via ROSTER_ACTIVE_FILTER.
        permissions: isActive
          ? {
              canViewAnalytics: a.canViewAnalytics,
              canEditProfile: a.canEditProfile,
              canExportData: a.canExportData,
              canManageBrands: a.canManageBrands,
            }
          : {
              canViewAnalytics: false,
              canEditProfile: false,
              canExportData: false,
              canManageBrands: false,
            },
        creator: a.creatorProfile,
      };
    });

    // Active first, then non-expired pending, then expired pending.
    mapped.sort((x, y) => {
      const order = (s: "active" | "pending" | "expired") =>
        s === "active" ? 0 : s === "pending" ? 1 : 2;
      const diff = order(x.inviteState) - order(y.inviteState);
      if (diff !== 0) return diff;
      return y.grantedAt.getTime() - x.grantedAt.getTime();
    });

    return mapped;
  }),

  /**
   * Single invite mutation for all eligible profiles (unclaimed/claimed/premium).
   *
   * Returns a discriminated union — business-state branching is type-safe through
   * tRPC; TRPCError is reserved for invalid input / auth / rate.
   *
   * Never sets `status: "active"`. Acceptance is creator-side only.
   */
  inviteCreator: talentManagerProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        permissions: permissionsSchema,
      }),
    )
    .mutation(async ({ ctx, input }): Promise<InviteCreatorResult> => {
      // Suspended-manager guard. (isTalentManager middleware doesn't check this;
      // explicit defense here.)
      if (ctx.user.suspended) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your account is suspended.",
        });
      }

      // Rate limit (fail-open if Upstash unconfigured).
      const allowed = await checkRateLimit(inviteCreationLimiter, ctx.user.id);
      if (!allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many invitations. Please slow down.",
        });
      }

      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { id: input.creatorProfileId },
        select: { id: true, userId: true, state: true, displayName: true },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Creator profile not found.",
        });
      }

      // Eligible states only.
      if (
        profile.state !== "unclaimed" &&
        profile.state !== "claimed" &&
        profile.state !== "premium"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This profile isn't eligible for invitation right now.",
        });
      }

      // Self-invite block (second of three layers).
      if (profile.userId === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can't invite yourself.",
        });
      }

      // Manager can't invite a profile they're actively trying to claim.
      const pendingClaim = await ctx.prisma.claimRequest.findFirst({
        where: {
          userId: ctx.user.id,
          creatorProfileId: profile.id,
          status: "pending",
        },
        select: { id: true },
      });
      if (pendingClaim) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You have a pending claim for this profile.",
        });
      }

      const profileWasClaimed = profile.userId !== null;
      const permissions = input.permissions ?? {
        canViewAnalytics: true,
        canEditProfile: false,
        canExportData: false,
        canManageBrands: false,
      };

      // Write-path lookup: needs to see ALL states (declined/revoked) to
      // resolve the existing-row branch. Not access-gated — no analytics
      // returned to the caller.
      const existing = await ctx.prisma.talentManagerAccess.findUnique({
        where: {
          managerId_creatorProfileId: {
            managerId: ctx.user.id,
            creatorProfileId: profile.id,
          },
        },
      });

      // Existing row resolution.
      if (existing) {
        if (existing.status === "active" && existing.revokedAt === null) {
          return { kind: "already_active", accessId: existing.id };
        }

        if (existing.status === "pending" && existing.revokedAt === null) {
          // Live pending invite — manager should use Regenerate. Do not silently
          // refresh the token here; that would invalidate a link the manager may
          // have already shared without their explicit action.
          return {
            kind: "pending_exists",
            accessId: existing.id,
            inviteExpiresAt: existing.inviteExpiresAt,
            profileWasClaimed,
          };
        }

        // declined or revoked → fresh invite cycle.
        const { token, hash, expiresAt } = generateInviteToken();
        const updated = await ctx.prisma.talentManagerAccess.update({
          where: { id: existing.id },
          data: {
            status: "pending",
            inviteTokenHash: hash,
            inviteExpiresAt: expiresAt,
            revokedAt: null,
            declinedAt: null,
            acceptedAt: null,
            grantedAt: new Date(),
            grantedBy: ctx.user.id,
            ...permissions,
          },
        });

        logAudit({
          userId: ctx.user.id,
          action: "roster.invited",
          targetType: "creatorProfile",
          targetId: profile.id,
          metadata: { accessId: updated.id, profileWasClaimed },
        });

        return {
          kind: "created",
          accessId: updated.id,
          inviteUrl: buildInviteUrl(token),
          expiresAt,
          profileWasClaimed,
        };
      }

      // No existing row → insert a fresh pending invite.
      const { token, hash, expiresAt } = generateInviteToken();
      const created = await ctx.prisma.talentManagerAccess.create({
        data: {
          managerId: ctx.user.id,
          creatorProfileId: profile.id,
          grantedBy: ctx.user.id,
          status: "pending",
          inviteTokenHash: hash,
          inviteExpiresAt: expiresAt,
          ...permissions,
        },
      });

      logAudit({
        userId: ctx.user.id,
        action: "roster.invited",
        targetType: "creatorProfile",
        targetId: profile.id,
        metadata: { accessId: created.id, profileWasClaimed },
      });

      return {
        kind: "created",
        accessId: created.id,
        inviteUrl: buildInviteUrl(token),
        expiresAt,
        profileWasClaimed,
      };
    }),

  /**
   * Generate a fresh token for an existing pending invite. The old token (if
   * still valid) becomes unresolvable — its hash is overwritten.
   */
  regenerateInvite: talentManagerProcedure
    .input(z.object({ accessId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const allowed = await checkRateLimit(inviteCreationLimiter, ctx.user.id);
      if (!allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many invitations. Please slow down.",
        });
      }

      const access = await ctx.prisma.talentManagerAccess.findUnique({
        where: { id: input.accessId },
        select: {
          id: true,
          managerId: true,
          status: true,
          revokedAt: true,
          creatorProfileId: true,
        },
      });

      if (!access || access.managerId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (access.status !== "pending" || access.revokedAt !== null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation is not pending.",
        });
      }

      const { token, hash, expiresAt } = generateInviteToken();
      await ctx.prisma.talentManagerAccess.update({
        where: { id: access.id },
        data: { inviteTokenHash: hash, inviteExpiresAt: expiresAt },
      });

      logAudit({
        userId: ctx.user.id,
        action: "roster.invite_resent",
        targetType: "creatorProfile",
        targetId: access.creatorProfileId,
        metadata: { accessId: access.id },
      });

      return { inviteUrl: buildInviteUrl(token), expiresAt };
    }),

  /**
   * Cancel a pending invite. Hash persists so the public landing page can
   * render "this invitation has been cancelled" instead of "not found".
   */
  cancelInvite: talentManagerProcedure
    .input(z.object({ accessId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const access = await ctx.prisma.talentManagerAccess.findUnique({
        where: { id: input.accessId },
        select: {
          id: true,
          managerId: true,
          status: true,
          revokedAt: true,
          creatorProfileId: true,
        },
      });

      if (!access || access.managerId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (access.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation is not pending.",
        });
      }

      await ctx.prisma.talentManagerAccess.update({
        where: { id: access.id },
        data: { revokedAt: new Date() },
      });

      logAudit({
        userId: ctx.user.id,
        action: "roster.invite_cancelled",
        targetType: "creatorProfile",
        targetId: access.creatorProfileId,
        metadata: { accessId: access.id },
      });

      return { success: true };
    }),

  /**
   * Remove a creator from the roster. Works for both active and pending rows.
   * Sets revokedAt; audit action depends on prior status.
   */
  removeCreator: talentManagerProcedure
    .input(z.object({ creatorProfileId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const access = await ctx.prisma.talentManagerAccess.findUnique({
        where: {
          managerId_creatorProfileId: {
            managerId: ctx.user.id,
            creatorProfileId: input.creatorProfileId,
          },
        },
      });

      if (!access || access.revokedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No active or pending relationship for this creator.",
        });
      }

      await ctx.prisma.talentManagerAccess.update({
        where: { id: access.id },
        data: { revokedAt: new Date() },
      });

      logAudit({
        userId: ctx.user.id,
        action:
          access.status === "active"
            ? "roster.revoked"
            : "roster.invite_cancelled",
        targetType: "creatorProfile",
        targetId: input.creatorProfileId,
        metadata: { accessId: access.id, priorStatus: access.status },
      });

      return { success: true, priorStatus: access.status };
    }),

  /**
   * Analytics gated on the dual active-access invariant + canViewAnalytics.
   * Pending rows never satisfy ROSTER_ACTIVE_FILTER.
   */
  getCreatorAnalytics: talentManagerProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        platform: z.nativeEnum(Platform).optional(),
        periodDays: z.number().int().min(7).max(90).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const access = await ctx.prisma.talentManagerAccess.findFirst({
        where: {
          managerId: ctx.user.id,
          creatorProfileId: input.creatorProfileId,
          ...ROSTER_ACTIVE_FILTER,
        },
      });

      if (!access || !access.canViewAnalytics) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No analytics access to this creator.",
        });
      }

      const since = new Date();
      since.setUTCDate(since.getUTCDate() - input.periodDays);

      return ctx.prisma.creatorAnalytics.findMany({
        where: {
          creatorProfileId: input.creatorProfileId,
          ...(input.platform ? { platform: input.platform } : {}),
          periodStart: { gte: since },
        },
        orderBy: { periodStart: "desc" },
      });
    }),
});
