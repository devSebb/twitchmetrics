import { z } from "zod";
import { Platform } from "@twitchmetrics/database";
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

export const talentManagerRouter = router({
  /**
   * Search creator profiles eligible for invitation.
   *
   * Returns `isClaimed: boolean` (computed server-side) instead of `userId` —
   * leaking another creator's user id to the client is unnecessary.
   *
   * Excludes the current user's own profile (defense-in-depth self-invite block,
   * first of three layers). Excludes `pending_claim` because a claim is mid-flight.
   */
  searchCreators: talentManagerProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      const profiles = await ctx.prisma.creatorProfile.findMany({
        where: {
          state: { in: ["unclaimed", "claimed", "premium"] },
          NOT: { userId: ctx.user.id },
          OR: [
            { displayName: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
            {
              platformAccounts: {
                some: {
                  platformUsername: { contains: q, mode: "insensitive" },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          displayName: true,
          slug: true,
          avatarUrl: true,
          state: true,
          totalFollowers: true,
          primaryPlatform: true,
          userId: true,
        },
        take: 8,
        orderBy: { totalFollowers: "desc" },
      });

      return profiles.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        slug: p.slug,
        avatarUrl: p.avatarUrl,
        state: p.state,
        totalFollowers: p.totalFollowers ? String(p.totalFollowers) : "0",
        primaryPlatform: p.primaryPlatform,
        isClaimed: p.userId !== null,
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
