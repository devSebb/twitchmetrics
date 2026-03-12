import { prisma } from "@twitchmetrics/database";
import { decryptToken, encryptToken } from "@/lib/encryption";
import { createLogger } from "@/lib/logger";
import { refreshAccessTokenForPlatform } from "@/server/services/token-refresh";
import { inngest } from "../../client";

const log = createLogger("token-refresh");

export const refreshTokens = inngest.createFunction(
  { id: "refresh-tokens", retries: 3 },
  { cron: "0 */12 * * *" },
  async ({ step }) => {
    const threshold = new Date(Date.now() + 60 * 60 * 1000);

    const accounts = await step.run(
      "find-expiring-oauth-accounts",
      async () => {
        return prisma.platformAccount.findMany({
          where: {
            isOAuthConnected: true,
            tokenExpiresAt: { lt: threshold },
            OR: [{ refreshToken: { not: null } }, { platform: "instagram" }],
          },
          select: {
            id: true,
            platform: true,
            accessToken: true,
            refreshToken: true,
          },
        });
      },
    );

    for (const account of accounts) {
      await step.run(`refresh-${account.platform}-${account.id}`, async () => {
        try {
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
            return;
          }

          await prisma.platformAccount.update({
            where: { id: account.id },
            data: {
              accessToken: await encryptToken(refreshed.accessToken),
              refreshToken: refreshed.refreshToken
                ? await encryptToken(refreshed.refreshToken)
                : account.refreshToken,
              tokenExpiresAt: refreshed.expiresAt,
              lastOAuthRefresh: new Date(),
              isOAuthConnected: true,
            },
          });
        } catch (error) {
          log.error(
            {
              err: error,
              platform: account.platform,
              platformAccountId: account.id,
            },
            "Failed token refresh for platform account",
          );
        }
      });
    }

    return { refreshedCount: accounts.length };
  },
);
