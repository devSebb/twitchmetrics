import { z } from "zod";
import { Platform, SnapshotTier } from "@twitchmetrics/database";
import { TRPCError } from "@trpc/server";
import { adminProcedure } from "../middleware";
import { router } from "../root";
import { logAudit } from "@/server/services/audit";

export const adminRouter = router({
  getClaimQueue: adminProcedure
    .input(
      z.object({
        status: z
          .enum(["pending", "approved", "rejected", "expired"])
          .default("pending"),
        page: z.number().int().positive().default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.limit;

      const [items, total] = await Promise.all([
        ctx.prisma.claimRequest.findMany({
          where: { status: input.status },
          include: {
            creatorProfile: {
              select: {
                id: true,
                displayName: true,
                slug: true,
                avatarUrl: true,
                totalFollowers: true,
                primaryPlatform: true,
              },
            },
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: input.status === "pending" ? "asc" : "desc" },
          skip,
          take: input.limit,
        }),
        ctx.prisma.claimRequest.count({
          where: { status: input.status },
        }),
      ]);

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        hasMore: skip + items.length < total,
      };
    }),

  getCreatorList: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        state: z
          .enum(["unclaimed", "pending_claim", "claimed", "premium"])
          .optional(),
        tier: z.nativeEnum(SnapshotTier).optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.limit;

      const where: Record<string, unknown> = {};
      if (input.state) where.state = input.state;
      if (input.tier) where.snapshotTier = input.tier;
      if (input.search) {
        where.OR = [
          { displayName: { contains: input.search, mode: "insensitive" } },
          { slug: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const [items, total] = await Promise.all([
        ctx.prisma.creatorProfile.findMany({
          where,
          select: {
            id: true,
            displayName: true,
            slug: true,
            avatarUrl: true,
            state: true,
            snapshotTier: true,
            primaryPlatform: true,
            totalFollowers: true,
            totalViews: true,
            lastSnapshotAt: true,
            createdAt: true,
            userId: true,
          },
          orderBy: { totalFollowers: "desc" },
          skip,
          take: input.limit,
        }),
        ctx.prisma.creatorProfile.count({ where }),
      ]);

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        hasMore: skip + items.length < total,
      };
    }),

  updateSnapshotTier: adminProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        tier: z.nativeEnum(SnapshotTier),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { id: input.creatorProfileId },
        select: { id: true, snapshotTier: true },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Creator profile not found.",
        });
      }

      const updated = await ctx.prisma.creatorProfile.update({
        where: { id: input.creatorProfileId },
        data: { snapshotTier: input.tier },
        select: {
          id: true,
          displayName: true,
          snapshotTier: true,
          updatedAt: true,
        },
      });

      logAudit({
        userId: ctx.user.id,
        action: "admin.updateSnapshotTier",
        targetType: "CreatorProfile",
        targetId: input.creatorProfileId,
        metadata: { previousTier: profile.snapshotTier, newTier: input.tier },
      });

      return updated;
    }),

  bulkImport: adminProcedure
    .input(
      z.object({
        creators: z
          .array(
            z.object({
              displayName: z.string().trim().min(1).max(100),
              slug: z.string().trim().min(1).max(100),
              primaryPlatform: z.nativeEnum(Platform),
              platformUsername: z.string().trim().min(1),
              platformUserId: z.string().trim().min(1),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        slug: string;
        status: "created" | "skipped";
        reason?: string;
      }> = [];

      for (const creator of input.creators) {
        // Check for existing profile by slug
        const existingBySlug = await ctx.prisma.creatorProfile.findUnique({
          where: { slug: creator.slug },
          select: { id: true },
        });

        if (existingBySlug) {
          results.push({
            slug: creator.slug,
            status: "skipped",
            reason: "Slug already exists",
          });
          continue;
        }

        // Check for existing platform account
        const existingAccount = await ctx.prisma.platformAccount.findUnique({
          where: {
            platform_platformUserId: {
              platform: creator.primaryPlatform,
              platformUserId: creator.platformUserId,
            },
          },
          select: { id: true },
        });

        if (existingAccount) {
          results.push({
            slug: creator.slug,
            status: "skipped",
            reason: "Platform account already linked",
          });
          continue;
        }

        await ctx.prisma.creatorProfile.create({
          data: {
            displayName: creator.displayName,
            slug: creator.slug,
            primaryPlatform: creator.primaryPlatform,
            searchText:
              `${creator.displayName} ${creator.platformUsername}`.toLowerCase(),
            platformAccounts: {
              create: {
                platform: creator.primaryPlatform,
                platformUserId: creator.platformUserId,
                platformUsername: creator.platformUsername,
                platformDisplayName: creator.displayName,
                platformUrl: `https://${creator.primaryPlatform === "x" ? "x.com" : `${creator.primaryPlatform}.tv`}/${creator.platformUsername}`,
              },
            },
          },
        });

        results.push({ slug: creator.slug, status: "created" });
      }

      const summary = {
        total: input.creators.length,
        created: results.filter((r) => r.status === "created").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        results,
      };

      logAudit({
        userId: ctx.user.id,
        action: "admin.bulkImport",
        metadata: {
          total: summary.total,
          created: summary.created,
          skipped: summary.skipped,
        },
      });

      return summary;
    }),

  // ─── User Management ───────────────────────────────────────

  listUsers: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        role: z.enum(["creator", "talent_manager", "admin"]).optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.limit;

      const where: Record<string, unknown> = {};
      if (input.role) where.role = input.role;
      if (input.search) {
        where.OR = [
          { name: { contains: input.search, mode: "insensitive" } },
          { email: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const [items, total] = await Promise.all([
        ctx.prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            suspended: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: input.limit,
        }),
        ctx.prisma.user.count({ where }),
      ]);

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        hasMore: skip + items.length < total,
      };
    }),

  updateUserRole: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(["creator", "talent_manager", "admin"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change your own role.",
        });
      }

      const adminCount = await ctx.prisma.user.count({
        where: { role: "admin" },
      });
      const target = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, role: true },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      if (
        target.role === "admin" &&
        input.role !== "admin" &&
        adminCount <= 1
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot remove the last admin.",
        });
      }

      const updated = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { role: input.role },
        select: { id: true, email: true, name: true, role: true },
      });

      logAudit({
        userId: ctx.user.id,
        action: "admin.updateUserRole",
        targetType: "User",
        targetId: input.userId,
        metadata: { previousRole: target.role, newRole: input.role },
      });

      return updated;
    }),

  suspendUser: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        suspended: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot suspend yourself.",
        });
      }

      const updated = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { suspended: input.suspended },
        select: { id: true, email: true, name: true, suspended: true },
      });

      logAudit({
        userId: ctx.user.id,
        action: input.suspended ? "admin.suspendUser" : "admin.unsuspendUser",
        targetType: "User",
        targetId: input.userId,
      });

      return updated;
    }),

  // ─── System Metrics ─────────────────────────────────────────

  getSystemMetrics: adminProcedure.query(async ({ ctx }) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      usersByRole,
      totalCreators,
      creatorsByState,
      creatorsByTier,
      totalSnapshots,
      snapshots24h,
      platformDist,
      totalGames,
      leads7d,
    ] = await Promise.all([
      ctx.prisma.user.count(),
      ctx.prisma.user.groupBy({ by: ["role"], _count: { id: true } }),
      ctx.prisma.creatorProfile.count(),
      ctx.prisma.creatorProfile.groupBy({
        by: ["state"],
        _count: { id: true },
      }),
      ctx.prisma.creatorProfile.groupBy({
        by: ["snapshotTier"],
        _count: { id: true },
      }),
      ctx.prisma.metricSnapshot.count(),
      ctx.prisma.metricSnapshot.count({
        where: { snapshotAt: { gte: twentyFourHoursAgo } },
      }),
      ctx.prisma.creatorProfile.groupBy({
        by: ["primaryPlatform"],
        _count: { id: true },
      }),
      ctx.prisma.game.count(),
      ctx.prisma.reportLead.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
    ]);

    return {
      totalUsers,
      usersByRole: usersByRole.map((r) => ({
        role: r.role,
        count: r._count.id,
      })),
      totalCreators,
      creatorsByState: creatorsByState.map((r) => ({
        state: r.state,
        count: r._count.id,
      })),
      creatorsByTier: creatorsByTier.map((r) => ({
        tier: r.snapshotTier,
        count: r._count.id,
      })),
      totalSnapshots,
      snapshots24h,
      platformDist: platformDist.map((r) => ({
        platform: r.primaryPlatform,
        count: r._count.id,
      })),
      totalGames,
      leads7d,
    };
  }),

  getSnapshotTrend: adminProcedure
    .input(z.object({ days: z.number().int().min(7).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const snapshots = await ctx.prisma.metricSnapshot.findMany({
        where: { snapshotAt: { gte: since } },
        select: { snapshotAt: true },
        orderBy: { snapshotAt: "asc" },
      });

      // Group by day
      const byDay: Record<string, number> = {};
      for (const s of snapshots) {
        const day = s.snapshotAt.toISOString().slice(0, 10);
        byDay[day] = (byDay[day] ?? 0) + 1;
      }

      // Fill gaps
      const result: { date: string; count: number }[] = [];
      for (let i = 0; i < input.days; i++) {
        const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        result.push({ date: key, count: byDay[key] ?? 0 });
      }

      return result;
    }),

  // ─── Audit Log ─────────────────────────────────────────────

  getAuditLog: adminProcedure
    .input(
      z.object({
        action: z.string().optional(),
        userId: z.string().uuid().optional(),
        targetType: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.limit;

      const where: Record<string, unknown> = {};
      if (input.action) where.action = { contains: input.action };
      if (input.userId) where.userId = input.userId;
      if (input.targetType) where.targetType = input.targetType;
      if (input.dateFrom || input.dateTo) {
        where.createdAt = {
          ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
          ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}),
        };
      }

      const [items, total] = await Promise.all([
        ctx.prisma.auditLog.findMany({
          where,
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: input.limit,
        }),
        ctx.prisma.auditLog.count({ where }),
      ]);

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        hasMore: skip + items.length < total,
      };
    }),

  // ─── System Health ──────────────────────────────────────────

  getSystemHealth: adminProcedure.query(async ({ ctx }) => {
    const now = Date.now();

    // DB ping
    let dbOk = false;
    try {
      await ctx.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }

    const tier1Interval = 15 * 60 * 1000;
    const tier2Interval = 60 * 60 * 1000;
    const tier3Interval = 6 * 60 * 60 * 1000;

    const [tier1Last, tier2Last, tier3Last, staleCreators, oldestPendingClaim] =
      await Promise.all([
        ctx.prisma.creatorProfile.findFirst({
          where: { snapshotTier: "tier1" },
          orderBy: { lastSnapshotAt: "desc" },
          select: { lastSnapshotAt: true },
        }),
        ctx.prisma.creatorProfile.findFirst({
          where: { snapshotTier: "tier2" },
          orderBy: { lastSnapshotAt: "desc" },
          select: { lastSnapshotAt: true },
        }),
        ctx.prisma.creatorProfile.findFirst({
          where: { snapshotTier: "tier3" },
          orderBy: { lastSnapshotAt: "desc" },
          select: { lastSnapshotAt: true },
        }),
        ctx.prisma.creatorProfile.count({
          where: {
            lastSnapshotAt: { lt: new Date(now - 24 * 60 * 60 * 1000) },
          },
        }),
        ctx.prisma.claimRequest.findFirst({
          where: { status: "pending" },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ]);

    const snapshotFreshness = {
      tier1: {
        lastAt: tier1Last?.lastSnapshotAt?.toISOString() ?? null,
        stale: tier1Last?.lastSnapshotAt
          ? now - tier1Last.lastSnapshotAt.getTime() > tier1Interval * 2
          : true,
      },
      tier2: {
        lastAt: tier2Last?.lastSnapshotAt?.toISOString() ?? null,
        stale: tier2Last?.lastSnapshotAt
          ? now - tier2Last.lastSnapshotAt.getTime() > tier2Interval * 2
          : true,
      },
      tier3: {
        lastAt: tier3Last?.lastSnapshotAt?.toISOString() ?? null,
        stale: tier3Last?.lastSnapshotAt
          ? now - tier3Last.lastSnapshotAt.getTime() > tier3Interval * 2
          : true,
      },
    };

    return {
      db: { ok: dbOk },
      snapshotFreshness,
      staleCreators,
      oldestPendingClaim: oldestPendingClaim?.createdAt?.toISOString() ?? null,
    };
  }),

  // ─── Platform Account Linking ────────────────────────────────

  linkPlatformAccount: adminProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        platform: z.nativeEnum(Platform),
        platformUsername: z.string().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Verify creator exists
      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { id: input.creatorProfileId },
        select: {
          id: true,
          displayName: true,
          slug: true,
          platformAccounts: {
            select: {
              platform: true,
              platformUsername: true,
              platformDisplayName: true,
            },
          },
        },
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Creator profile not found.",
        });
      }

      // 2. Check no existing account for this platform
      const existing = profile.platformAccounts.find(
        (a) => a.platform === input.platform,
      );
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Creator already has a ${input.platform} account (@${existing.platformUsername}).`,
        });
      }

      // 3. Attempt adapter verification to populate real data
      const { getAdapter } = await import("@/server/adapters");
      const adapter = getAdapter(input.platform);

      let platformUserId = input.platformUsername;
      let followerCount: bigint | null = null;
      let platformDisplayName: string | null = null;
      let avatarUrl: string | null = null;
      let platformUrl: string | null = null;

      if (adapter) {
        try {
          const adapterProfile = await adapter.fetchProfile(
            input.platformUsername,
          );
          platformUserId = adapterProfile.platformUserId;
          followerCount = adapterProfile.followerCount ?? null;
          platformDisplayName = adapterProfile.platformDisplayName ?? null;
          avatarUrl = adapterProfile.platformAvatarUrl ?? null;
          platformUrl = adapterProfile.platformUrl ?? null;
        } catch {
          // Adapter failed — still create the account with minimal data
        }
      }

      // 4. Create PlatformAccount
      const account = await ctx.prisma.platformAccount.create({
        data: {
          creatorProfileId: input.creatorProfileId,
          platform: input.platform,
          platformUserId,
          platformUsername: input.platformUsername.toLowerCase(),
          platformDisplayName,
          platformUrl,
          platformAvatarUrl: avatarUrl,
          followerCount,
          isOAuthConnected: false,
        },
      });

      // 5. Update searchText to include new username
      const allAccounts = [
        ...profile.platformAccounts,
        {
          platformUsername: input.platformUsername.toLowerCase(),
          platformDisplayName,
        },
      ];
      const searchParts = [
        profile.displayName,
        profile.slug,
        ...allAccounts.map((a) => a.platformUsername).filter(Boolean),
        ...allAccounts
          .map((a) => a.platformDisplayName)
          .filter((v) => v != null),
      ];
      const searchText = [...new Set(searchParts)].join(" ").toLowerCase();
      await ctx.prisma.creatorProfile.update({
        where: { id: input.creatorProfileId },
        data: { searchText },
      });

      // 6. Audit log
      logAudit({
        userId: ctx.user.id,
        action: "admin.linkPlatformAccount",
        targetType: "CreatorProfile",
        targetId: input.creatorProfileId,
        metadata: {
          platform: input.platform,
          platformUsername: input.platformUsername,
          platformUserId,
        },
      });

      return account;
    }),
});
