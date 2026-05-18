import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../middleware";
import { publicProcedure, router } from "../root";
import {
  checkRateLimit,
  hashInviteToken,
  inviteAcceptLimiter,
  inviteLookupLimiter,
} from "@/server/services/roster-invite";
import { logAudit } from "@/server/services/audit";

function extractClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "unknown";
}

type InviteSummary = {
  accessId: string;
  manager: { displayName: string; avatarUrl: string | null };
  creatorProfile: {
    id: string;
    displayName: string;
    slug: string;
    avatarUrl: string | null;
    state: string;
    userId: string | null;
  };
  permissions: {
    canViewAnalytics: boolean;
    canEditProfile: boolean;
    canExportData: boolean;
    canManageBrands: boolean;
  };
  inviteExpiresAt: Date | null;
};

export type InviteLookupResult =
  | { kind: "not_found" }
  | {
      kind: "cancelled";
      manager: { displayName: string };
      creatorProfile: { displayName: string; slug: string };
    }
  | {
      kind: "declined";
      manager: { displayName: string };
      creatorProfile: { displayName: string; slug: string };
    }
  | {
      kind: "accepted";
      manager: { displayName: string };
      creatorProfile: { displayName: string; slug: string };
    }
  | {
      kind: "expired";
      manager: { displayName: string };
      creatorProfile: { displayName: string; slug: string };
      expiredAt: Date;
    }
  | ({ kind: "pending" } & InviteSummary);

export const rosterInviteRouter = router({
  /**
   * Public token lookup for the invite landing page.
   *
   * Terminal-state priority (computed in this exact order):
   *   not_found → cancelled → declined → accepted → expired → pending
   *
   * Consumed states beat expiry — if the creator declined two years ago, the
   * link still says "previously declined", not "expired".
   *
   * The token hash persists through accept/decline/cancel; only regeneration
   * overwrites it. So a returning visitor always sees the correct terminal
   * state, not a confusing "not found".
   */
  getByToken: publicProcedure
    .input(z.object({ token: z.string().min(8).max(128) }))
    .query(async ({ ctx, input }): Promise<InviteLookupResult> => {
      const ip = extractClientIp(ctx.headers);
      const allowed = await checkRateLimit(inviteLookupLimiter, ip);
      if (!allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many lookups. Please slow down.",
        });
      }

      const hash = hashInviteToken(input.token);
      const access = await ctx.prisma.talentManagerAccess.findUnique({
        where: { inviteTokenHash: hash },
        include: {
          manager: { select: { name: true, image: true } },
          creatorProfile: {
            select: {
              id: true,
              displayName: true,
              slug: true,
              avatarUrl: true,
              state: true,
              userId: true,
            },
          },
        },
      });

      if (!access) {
        return { kind: "not_found" };
      }

      const managerName = access.manager.name ?? "A talent manager";
      const summaryHeader = {
        manager: { displayName: managerName },
        creatorProfile: {
          displayName: access.creatorProfile.displayName,
          slug: access.creatorProfile.slug,
        },
      };

      // Priority order: cancelled → declined → accepted → expired → pending.
      if (access.revokedAt !== null) {
        return { kind: "cancelled", ...summaryHeader };
      }
      if (access.status === "declined") {
        return { kind: "declined", ...summaryHeader };
      }
      if (access.status === "active") {
        return { kind: "accepted", ...summaryHeader };
      }
      if (
        access.inviteExpiresAt !== null &&
        access.inviteExpiresAt.getTime() < Date.now()
      ) {
        return {
          kind: "expired",
          ...summaryHeader,
          expiredAt: access.inviteExpiresAt,
        };
      }

      return {
        kind: "pending",
        accessId: access.id,
        manager: { displayName: managerName, avatarUrl: access.manager.image },
        creatorProfile: access.creatorProfile,
        permissions: {
          canViewAnalytics: access.canViewAnalytics,
          canEditProfile: access.canEditProfile,
          canExportData: access.canExportData,
          canManageBrands: access.canManageBrands,
        },
        inviteExpiresAt: access.inviteExpiresAt,
      };
    }),

  /**
   * Accept a pending invitation.
   *
   * Race safety: all safety conditions live in the updateMany WHERE clause.
   * Concurrent accepts become harmless no-ops (second tab gets count: 0 and
   * refetches the current state).
   *
   * Self-invite block (third of three layers): `NOT: { managerId: ctx.user.id }`
   * in the WHERE clause prevents a manager who self-invited an unclaimed
   * profile + later claimed it from accepting their own invitation.
   *
   * Suspended-manager check is a pre-check (Prisma can't express it through
   * the relation in one updateMany cleanly).
   */
  accept: protectedProcedure
    .input(z.object({ accessId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const allowed = await checkRateLimit(inviteAcceptLimiter, ctx.user.id);
      if (!allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests. Please slow down.",
        });
      }

      // Pre-check for informative error + suspended-manager guard.
      // Diagnostic lookup; the actual access transition lives in the
      // updateMany WHERE below — all guards repeated atomically there.
      const pre = await ctx.prisma.talentManagerAccess.findUnique({
        where: { id: input.accessId },
        include: {
          manager: { select: { suspended: true } },
          creatorProfile: { select: { userId: true } },
        },
      });

      if (!pre) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (pre.manager.suspended) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This manager's account is suspended.",
        });
      }
      if (pre.creatorProfile.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This invitation belongs to a different account.",
        });
      }
      if (pre.managerId === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can't accept your own invitation.",
        });
      }

      // Race-safe atomic update — all guards repeated in WHERE.
      const result = await ctx.prisma.talentManagerAccess.updateMany({
        where: {
          id: input.accessId,
          status: "pending",
          revokedAt: null,
          inviteExpiresAt: { gt: new Date() },
          creatorProfile: { userId: ctx.user.id },
          NOT: { managerId: ctx.user.id },
        },
        data: { status: "active", acceptedAt: new Date() },
      });

      if (result.count === 0) {
        // Another tab / expired between pre-check and update / etc.
        throw new TRPCError({
          code: "CONFLICT",
          message: "This invitation can't be accepted anymore.",
        });
      }

      logAudit({
        userId: ctx.user.id,
        action: "roster.invite_accepted",
        targetType: "talentManagerAccess",
        targetId: input.accessId,
        metadata: { managerId: pre.managerId },
      });

      return { success: true };
    }),

  /**
   * Decline a pending invitation. Same race-safe pattern as accept.
   */
  decline: protectedProcedure
    .input(z.object({ accessId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const allowed = await checkRateLimit(inviteAcceptLimiter, ctx.user.id);
      if (!allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests. Please slow down.",
        });
      }

      const pre = await ctx.prisma.talentManagerAccess.findUnique({
        where: { id: input.accessId },
        include: {
          creatorProfile: { select: { userId: true } },
        },
      });

      if (!pre) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (pre.creatorProfile.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This invitation belongs to a different account.",
        });
      }

      const result = await ctx.prisma.talentManagerAccess.updateMany({
        where: {
          id: input.accessId,
          status: "pending",
          revokedAt: null,
          inviteExpiresAt: { gt: new Date() },
          creatorProfile: { userId: ctx.user.id },
        },
        data: { status: "declined", declinedAt: new Date() },
      });

      if (result.count === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This invitation can't be declined anymore.",
        });
      }

      logAudit({
        userId: ctx.user.id,
        action: "roster.invite_declined",
        targetType: "talentManagerAccess",
        targetId: input.accessId,
        metadata: { managerId: pre.managerId },
      });

      return { success: true };
    }),

  /**
   * The bell's data source. Returns pending invites for profiles the current
   * user owns. Expired invites are filtered out — the creator can't act on
   * them anyway; the manager sees them in the roster and can regenerate.
   *
   * Intentionally fetches pending rows only. No ROSTER_ACTIVE_FILTER needed
   * because the response is gated to (a) profiles the user owns and
   * (b) status === "pending" — it grants no analytics/private access.
   */
  listForCurrentUser: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const rows = await ctx.prisma.talentManagerAccess.findMany({
      where: {
        status: "pending",
        revokedAt: null,
        inviteExpiresAt: { gt: now },
        creatorProfile: { userId: ctx.user.id },
        NOT: { managerId: ctx.user.id },
      },
      include: {
        manager: { select: { name: true, image: true } },
        creatorProfile: { select: { displayName: true, slug: true } },
      },
      orderBy: { grantedAt: "desc" },
    });

    return rows.map((r) => ({
      accessId: r.id,
      manager: {
        displayName: r.manager.name ?? "A talent manager",
        avatarUrl: r.manager.image,
      },
      creatorProfile: {
        displayName: r.creatorProfile.displayName,
        slug: r.creatorProfile.slug,
      },
      permissions: {
        canViewAnalytics: r.canViewAnalytics,
        canEditProfile: r.canEditProfile,
        canExportData: r.canExportData,
        canManageBrands: r.canManageBrands,
      },
      inviteExpiresAt: r.inviteExpiresAt,
      grantedAt: r.grantedAt,
    }));
  }),
});
