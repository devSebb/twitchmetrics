import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import TwitchProvider from "next-auth/providers/twitch";
import GoogleProvider from "next-auth/providers/google";
import TwitterProvider from "next-auth/providers/twitter";
import CredentialsProvider from "next-auth/providers/credentials";
import ResendProvider from "next-auth/providers/resend";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@twitchmetrics/database";
import type { Platform } from "@twitchmetrics/database";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function extractPlatformUserId(
  provider: string,
  profile: unknown,
): string | null {
  if (provider === "twitch") {
    if (
      profile &&
      typeof profile === "object" &&
      "sub" in profile &&
      typeof profile.sub === "string"
    ) {
      return profile.sub;
    }
    return null;
  }

  if (provider === "twitter") {
    if (
      profile &&
      typeof profile === "object" &&
      "data" in profile &&
      profile.data &&
      typeof profile.data === "object" &&
      "id" in profile.data &&
      typeof profile.data.id === "string"
    ) {
      return profile.data.id;
    }
    return null;
  }

  // Google/YouTube platform user ID enrichment is handled in a later phase.
  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    strategy: "database",
  },
  providers: [
    // Twitch — Helix API
    TwitchProvider({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: ["user:read:email", "channel:read:subscriptions"].join(" "),
        },
      },
    }),

    // Google/YouTube — Data API v3 + Analytics API
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/yt-analytics.readonly",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),

    // TODO: Instagram — Custom provider needed
    // Graph API scopes: instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement

    // TODO: TikTok — Custom provider needed
    // Login API: user.info.basic, user.info.stats

    // X / Twitter
    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
    }),

    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user?.passwordHash) {
          return null;
        }

        const passwordMatches = await compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!passwordMatches) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),

    ResendProvider({
      apiKey: process.env.RESEND_API_KEY ?? "",
      from: "TwitchMetrics <noreply@twitchmetrics.net>",
      sendVerificationRequest: async ({ identifier, url, provider }) => {
        if (!provider.apiKey) {
          throw new Error(
            "Missing RESEND_API_KEY for magic link email delivery.",
          );
        }

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: "Your TwitchMetrics magic sign-in link",
            html: `
              <div style="font-family: Arial, sans-serif; background: #2B2D31; color: #DBDEE1; padding: 24px;">
                <h2 style="margin: 0 0 12px; color: #F2F3F5;">Sign in to TwitchMetrics</h2>
                <p style="margin: 0 0 20px; color: #949BA4;">Click the button below to securely sign in.</p>
                <a href="${url}" style="display: inline-block; background: #E32C19; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">
                  Sign In
                </a>
                <p style="margin: 20px 0 0; font-size: 12px; color: #949BA4;">If you did not request this, you can ignore this email.</p>
              </div>
            `,
            text: `Sign in to TwitchMetrics: ${url}`,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to send magic link via Resend");
        }
      },
    }),

    // TODO: Kick — Custom provider needed (no standard OAuth provider exists)
  ],
  callbacks: {
    session: ({ session, user }) => {
      session.user.id = user.id;
      session.user.role = (user as { role: string }).role;
      return session;
    },
    signIn: async ({ user, account, profile }) => {
      if (!account || !user.id) {
        return true;
      }

      const platformMap: Record<string, Platform> = {
        twitch: "twitch",
        google: "youtube",
        twitter: "x",
      };
      const platform = platformMap[account.provider];
      if (!platform) {
        return true;
      }

      const platformUserId = extractPlatformUserId(account.provider, profile);
      if (!platformUserId) {
        return true;
      }

      const platformAccount = await prisma.platformAccount.findUnique({
        where: {
          platform_platformUserId: {
            platform,
            platformUserId,
          },
        },
      });

      if (!platformAccount) {
        return true;
      }

      try {
        const { encryptToken } = await import("@/lib/encryption");
        const accessToken = account.access_token
          ? await encryptToken(account.access_token)
          : null;
        const refreshToken = account.refresh_token
          ? await encryptToken(account.refresh_token)
          : null;

        await prisma.platformAccount.update({
          where: { id: platformAccount.id },
          data: {
            accessToken,
            refreshToken,
            tokenExpiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
            oauthScopes: account.scope
              ? account.scope.split(" ").filter((scope) => scope.length > 0)
              : [],
            isOAuthConnected: true,
            lastOAuthRefresh: new Date(),
          },
        });
      } catch (error) {
        console.error("Failed to persist OAuth tokens for platform account", {
          provider: account.provider,
          platformAccountId: platformAccount.id,
          error,
        });
      }

      return true;
    },
  },
  pages: {
    signIn: "/login",
  },
});
