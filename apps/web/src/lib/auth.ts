import NextAuth from "next-auth";
import type { Account, Profile, User } from "next-auth";
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
import { isOAuthProviderConfigured } from "@/lib/oauth-providers";
import { InstagramProvider } from "@/server/auth/instagram-provider";
import { TikTokProvider } from "@/server/auth/tiktok-provider";
import { KickProvider } from "@/server/auth/kick-provider";
import { connectPlatform } from "@/server/services/platform-connection";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

async function syncPlatformConnection({
  user,
  account,
  profile,
}: {
  user: User;
  account: Account | null;
  profile?: Profile;
}) {
  if (!account || (account.type !== "oauth" && account.type !== "oidc")) {
    return;
  }

  if (!user.id) {
    return;
  }

  try {
    await connectPlatform({
      userId: user.id,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      accessToken: account.access_token ?? null,
      refreshToken: account.refresh_token ?? null,
      expiresAt: account.expires_at ?? null,
      scope: account.scope ?? null,
      profile,
    });
  } catch (error) {
    console.error("Failed to sync platform account after OAuth sign-in", {
      provider: account.provider,
      userId: user.id,
      error,
    });
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  ...(authSecret ? { secret: authSecret } : {}),
  trustHost: true,
  debug: process.env.NODE_ENV === "development",
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [
    // Twitch — Helix API
    ...(isOAuthProviderConfigured("twitch")
      ? [
          TwitchProvider({
            clientId: process.env.TWITCH_CLIENT_ID!,
            clientSecret: process.env.TWITCH_CLIENT_SECRET!,
            authorization: {
              params: {
                scope: [
                  "openid",
                  "user:read:email",
                  "channel:read:subscriptions",
                ].join(" "),
              },
            },
          }),
        ]
      : []),

    // Google/YouTube — Data API v3 + Analytics API
    ...(isOAuthProviderConfigured("google")
      ? [
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
        ]
      : []),

    ...(isOAuthProviderConfigured("instagram")
      ? [
          InstagramProvider({
            clientId:
              process.env.INSTAGRAM_CLIENT_ID ??
              process.env.INSTAGRAM_APP_ID ??
              "",
            clientSecret:
              process.env.INSTAGRAM_CLIENT_SECRET ??
              process.env.INSTAGRAM_APP_SECRET ??
              "",
          }),
        ]
      : []),

    ...(isOAuthProviderConfigured("tiktok")
      ? [
          TikTokProvider({
            clientKey:
              process.env.TIKTOK_CLIENT_KEY ??
              process.env.TIKTOK_CLIENT_ID ??
              "",
            clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "",
          }),
        ]
      : []),

    // X / Twitter
    ...(isOAuthProviderConfigured("twitter")
      ? [
          TwitterProvider({
            clientId: process.env.TWITTER_CLIENT_ID!,
            clientSecret: process.env.TWITTER_CLIENT_SECRET!,
          }),
        ]
      : []),

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
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            suspended: true,
            hasCompletedOnboarding: true,
            passwordHash: true,
          },
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

        if (user.suspended) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          suspended: user.suspended,
          hasCompletedOnboarding: user.hasCompletedOnboarding,
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

    // Kick — custom OAuth2 provider
    ...(isOAuthProviderConfigured("kick")
      ? [
          KickProvider({
            clientId: process.env.KICK_CLIENT_ID!,
            clientSecret: process.env.KICK_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.suspended = (user as { suspended?: boolean }).suspended ?? false;
        token.hasCompletedOnboarding =
          (user as { hasCompletedOnboarding?: boolean })
            .hasCompletedOnboarding ?? false;
        token.roleRefreshedAt = Date.now();
      }

      // Fast-path: when onboarding is not yet completed, check DB every request
      // so the redirect stops immediately after onboarding completes
      if (token.hasCompletedOnboarding === false && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, suspended: true, hasCompletedOnboarding: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.suspended = dbUser.suspended;
          token.hasCompletedOnboarding = dbUser.hasCompletedOnboarding;
          token.roleRefreshedAt = Date.now();
        }
        return token;
      }

      const ROLE_REFRESH_INTERVAL = 5 * 60 * 1000;
      if (
        Date.now() - ((token.roleRefreshedAt as number) ?? 0) >
          ROLE_REFRESH_INTERVAL &&
        token.id
      ) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, suspended: true, hasCompletedOnboarding: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.suspended = dbUser.suspended;
          token.hasCompletedOnboarding = dbUser.hasCompletedOnboarding;
          token.roleRefreshedAt = Date.now();
        }
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "creator";
        (session.user as { suspended?: boolean }).suspended =
          (token.suspended as boolean) ?? false;
        session.user.hasCompletedOnboarding =
          (token.hasCompletedOnboarding as boolean) ?? false;
      }
      return session;
    },
    signIn: async ({ user, account, profile }) => {
      // Credentials sign-in: authorize() already validated the user.
      // Onboarding redirect is handled by middleware — just allow the sign-in.
      if (!account) {
        return true;
      }

      // Middleware handles /onboarding redirect for incomplete onboarding.
      return true;
    },
    redirect: async ({ url, baseUrl }) => {
      const parsed = url.startsWith("/") ? new URL(url, baseUrl) : new URL(url);
      if (parsed.origin !== new URL(baseUrl).origin) {
        return baseUrl;
      }

      if (parsed.pathname === "/home") {
        return `${baseUrl}/dashboard/home`;
      }
      if (parsed.pathname === "/dashboard") {
        return `${baseUrl}/dashboard/home`;
      }
      return parsed.toString();
    },
  },
  pages: {
    signIn: "/login",
  },
  events: {
    signIn: async ({ user, account, profile }) => {
      await syncPlatformConnection({
        user,
        account,
        ...(profile ? { profile } : {}),
      });
    },
  },
});
