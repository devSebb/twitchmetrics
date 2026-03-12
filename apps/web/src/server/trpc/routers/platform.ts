import { Platform, type PlatformAccount } from "@twitchmetrics/database";
import { z } from "zod";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { decryptToken, encryptToken } from "@/lib/encryption";
import { refreshAccessTokenForPlatform } from "@/server/services/token-refresh";
import { protectedProcedure } from "../middleware";
import { router } from "../root";

const PLATFORM_PROVIDER_MAP: Partial<Record<Platform, string[]>> = {
  twitch: ["twitch"],
  youtube: ["google"],
  x: ["twitter"],
  instagram: ["instagram"],
  tiktok: ["tiktok"],
};

export const platformRouter = router({
  listConnections: protectedProcedure.query(async ({ ctx }) => {
    const creatorProfile = await ctx.prisma.creatorProfile.findUnique({
      where: { userId: ctx.user.id },
      include: { platformAccounts: true },
    });

    const accountByPlatform = new Map<Platform, PlatformAccount>();
    for (const account of creatorProfile?.platformAccounts ?? []) {
      accountByPlatform.set(account.platform, account);
    }

    return (Object.keys(PLATFORM_CONFIG) as Platform[]).map((platform) => {
      const config = PLATFORM_CONFIG[platform];
      const account = accountByPlatform.get(platform);
      const connection = account
        ? {
            isConnected: account.isOAuthConnected,
            username: account.platformUsername,
            followerCount:
              account.followerCount !== null
                ? account.followerCount.toString()
                : null,
            lastSyncedAt: account.lastSyncedAt
              ? account.lastSyncedAt.toISOString()
              : null,
            tokenExpiresAt: account.tokenExpiresAt
              ? account.tokenExpiresAt.toISOString()
              : null,
          }
        : null;

      const providerNames = PLATFORM_PROVIDER_MAP[platform] ?? [];
      const oauthProviderReady =
        platform === "instagram"
          ? Boolean(
              (process.env.INSTAGRAM_CLIENT_ID ||
                process.env.INSTAGRAM_APP_ID) &&
              (process.env.INSTAGRAM_CLIENT_SECRET ||
                process.env.INSTAGRAM_APP_SECRET),
            )
          : platform === "tiktok"
            ? Boolean(
                (process.env.TIKTOK_CLIENT_KEY ||
                  process.env.TIKTOK_CLIENT_ID) &&
                process.env.TIKTOK_CLIENT_SECRET,
              )
            : providerNames.length > 0;

      return {
        platform,
        config,
        connection,
        oauthProviderReady,
      };
    });
  }),

  disconnect: protectedProcedure
    .input(z.object({ platform: z.nativeEnum(Platform) }))
    .mutation(async ({ ctx, input }) => {
      const creatorProfile = await ctx.prisma.creatorProfile.findUnique({
        where: { userId: ctx.user.id },
        select: { id: true },
      });
      if (!creatorProfile) {
        return { success: true };
      }

      await ctx.prisma.platformAccount.updateMany({
        where: {
          creatorProfileId: creatorProfile.id,
          platform: input.platform,
        },
        data: {
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          isOAuthConnected: false,
          oauthScopes: [],
        },
      });

      const providers = PLATFORM_PROVIDER_MAP[input.platform] ?? [];
      if (providers.length > 0) {
        await ctx.prisma.account.deleteMany({
          where: {
            userId: ctx.user.id,
            provider: { in: providers },
          },
        });
      }

      return { success: true };
    }),

  refreshTokens: protectedProcedure
    .input(z.object({ platform: z.nativeEnum(Platform) }))
    .mutation(async ({ ctx, input }) => {
      const accounts = await ctx.prisma.platformAccount.findMany({
        where: {
          creatorProfile: { userId: ctx.user.id },
          platform: input.platform,
          isOAuthConnected: true,
        },
        select: {
          id: true,
          platform: true,
          accessToken: true,
          refreshToken: true,
        },
      });

      let refreshedCount = 0;

      for (const account of accounts) {
        const decryptedAccessToken = account.accessToken
          ? await decryptToken(account.accessToken)
          : null;
        const decryptedRefreshToken = account.refreshToken
          ? await decryptToken(account.refreshToken)
          : null;

        const refreshed = await refreshAccessTokenForPlatform(
          account.platform,
          decryptedAccessToken,
          decryptedRefreshToken,
        );

        if (!refreshed) {
          continue;
        }

        await ctx.prisma.platformAccount.update({
          where: { id: account.id },
          data: {
            accessToken: await encryptToken(refreshed.accessToken),
            refreshToken: refreshed.refreshToken
              ? await encryptToken(refreshed.refreshToken)
              : account.refreshToken,
            tokenExpiresAt: refreshed.expiresAt,
            isOAuthConnected: true,
            lastOAuthRefresh: new Date(),
          },
        });

        refreshedCount += 1;
      }

      return { success: true, refreshedCount };
    }),

  connectionStatus: protectedProcedure
    .input(z.object({ platform: z.nativeEnum(Platform) }))
    .query(async ({ ctx, input }) => {
      const account = await ctx.prisma.platformAccount.findFirst({
        where: {
          creatorProfile: { userId: ctx.user.id },
          platform: input.platform,
        },
        select: {
          isOAuthConnected: true,
          lastSyncedAt: true,
          tokenExpiresAt: true,
          oauthScopes: true,
        },
      });

      if (!account) {
        return {
          isConnected: false,
          lastSyncedAt: null,
          tokenExpiresAt: null,
          scopes: [],
        };
      }

      return {
        isConnected: account.isOAuthConnected,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
        tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
        scopes: account.oauthScopes,
      };
    }),
});
