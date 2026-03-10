import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import TwitchProvider from "next-auth/providers/twitch"
import GoogleProvider from "next-auth/providers/google"
import TwitterProvider from "next-auth/providers/twitter"
import { prisma } from "@twitchmetrics/database"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    // Twitch — Helix API
    TwitchProvider({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "user:read:email",
            "channel:read:subscriptions",
          ].join(" "),
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

    // TODO: Kick — Custom provider needed (no standard OAuth provider exists)
  ],
  callbacks: {
    session: ({ session, user }) => {
      session.user.id = user.id
      session.user.role = (user as { role: string }).role
      return session
    },
    signIn: async ({ user, account, profile }) => {
      // TODO: On sign-in, check if this OAuth account's platformUserId matches
      //       any existing PlatformAccount record. If so, this is a claim attempt —
      //       auto-link the user to the CreatorProfile.
      //
      // TODO: If no match, proceed with normal sign-in flow and send to onboarding.
      //
      // TODO: Store encrypted OAuth tokens (access_token, refresh_token) in PlatformAccount
      //       for ongoing API access.
      return true
    },
  },
  pages: {
    signIn: "/login",
  },
})
