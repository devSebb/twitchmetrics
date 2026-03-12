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
import { InstagramProvider } from "@/server/auth/instagram-provider";
import { TikTokProvider } from "@/server/auth/tiktok-provider";
import { connectPlatform } from "@/server/services/platform-connection";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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

    ...((process.env.INSTAGRAM_CLIENT_ID || process.env.INSTAGRAM_APP_ID) &&
    (process.env.INSTAGRAM_CLIENT_SECRET || process.env.INSTAGRAM_APP_SECRET)
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

    ...((process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CLIENT_ID) &&
    process.env.TIKTOK_CLIENT_SECRET
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
        if (!user.name || user.name.trim().length === 0) {
          return "/onboarding";
        }
        return true;
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
        console.error("Failed to connect platform account during sign-in", {
          provider: account.provider,
          error,
        });
      }

      if (!user.name || user.name.trim().length === 0) {
        return "/onboarding";
      }
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
});
