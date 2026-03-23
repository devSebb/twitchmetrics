# TwitchMetrics — Platform Registration & Credentials Guide

**Last updated:** 2026-03-23
**Deployment target:** Vercel + Neon (updated from original AWS + Supabase plan)

> This is the single source of truth for every external account, credential, and environment variable required to run TwitchMetrics. Do not store actual credentials in this file — use it as the registration checklist and env var reference only.

---

## Deployment Stack (Revised)

| What                                | Provider          | Why                                                                         |
| ----------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| **App hosting**                     | Vercel            | First-party Next.js 15 support, Edge Middleware, Turborepo monorepo support |
| **Database**                        | Neon              | Serverless PostgreSQL with HTTP driver — no connection exhaustion on Vercel |
| **Redis (rate limiting + caching)** | Upstash           | Serverless HTTP Redis — no TCP connections, works on Vercel                 |
| **Background jobs**                 | Inngest           | Fully implemented (9 functions). Works natively with Vercel via webhook     |
| **File storage**                    | Cloudflare R2     | S3-compatible, cheap egress, already configured in code                     |
| **Email**                           | Resend            | Magic link auth + digest emails                                             |
| **Error tracking**                  | Sentry            | Server + client error tracking, source maps                                 |
| **OAuth providers**                 | See section below | Twitch (required), Google/YouTube (required), others optional               |

> **Note:** The old plan referenced AWS (ECS Fargate, ECR, ALB, Route 53) and Supabase PostgreSQL. These are no longer the deployment targets. AWS and Supabase PostgreSQL are **not needed**. Supabase Realtime remains a future option if realtime push is added.

---

## Priority Order — Register These First

Services marked **[BLOCKING]** must be set up before the app can run at all.

| #   | Service          | Priority              | Env Vars                                                             |
| --- | ---------------- | --------------------- | -------------------------------------------------------------------- |
| 1   | Neon             | **[BLOCKING]**        | `DATABASE_URL`, `DIRECT_URL`                                         |
| 2   | Upstash          | **[BLOCKING]**        | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                 |
| 3   | Inngest          | **[BLOCKING]**        | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`                           |
| 4   | Twitch           | **[BLOCKING]**        | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_EVENTSUB_SECRET` |
| 5   | Google / YouTube | **[BLOCKING]**        | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `YOUTUBE_API_KEY`        |
| 6   | Resend           | **[BLOCKING]**        | `RESEND_API_KEY`                                                     |
| 7   | Auth secrets     | **[BLOCKING]**        | `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`                                  |
| 8   | Vercel           | **[BLOCKING]**        | Deploy target — connect repo                                         |
| 9   | Sentry           | Optional              | `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`    |
| 10  | Cloudflare R2    | Optional at launch    | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, etc.                            |
| 11  | Twitter/X        | Optional at launch    | `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TWITTER_BEARER_TOKEN` |
| 12  | Instagram        | Requires Meta review  | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`                     |
| 13  | TikTok           | Requires API approval | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`                          |
| 14  | Kick             | Deferred              | `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, `KICK_WEBHOOK_SECRET`        |

---

## 1. Neon — PostgreSQL Database

**URL:** https://neon.tech
**What it does:** Primary relational database (23 models, Prisma ORM). Neon is built for serverless — uses HTTP-based connections that don't exhaust PostgreSQL's `max_connections` on Vercel.

### Registration Steps

1. Go to neon.tech → Sign up / Log in
2. Create a new project → name it `twitchmetrics` → select region closest to your users (e.g., `us-east-1`)
3. Neon will create a default database called `neondb`
4. Go to **Dashboard → Connection Details**
5. Select **Pooled connection** → copy the connection string (this is your `DATABASE_URL`)
6. Select **Direct connection** → copy the connection string (this is your `DIRECT_URL`)

### Data to Collect

```
DATABASE_URL=postgresql://[user]:[password]@[host]-pooler.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://[user]:[password]@[host].neon.tech/neondb?sslmode=require
```

> The pooled URL ends in `-pooler.neon.tech` — this is Neon's built-in connection pooler. Always use this for `DATABASE_URL`. Use the direct URL only for `DIRECT_URL` (Prisma migrations).

### After Setup

Run migrations:

```bash
cd packages/database
pnpm prisma migrate deploy
pnpm prisma generate
```

---

## 2. Upstash — Redis (Rate Limiting + Caching)

**URL:** https://upstash.com
**What it does:** Serverless HTTP-based Redis. Used for:

- Per-platform API rate limiting (Twitch: 800 req/60s, YouTube: 10k units/day, etc.)
- Claim verification caching and cooldown windows
- OAuth state/nonce storage

### Registration Steps

1. Go to upstash.com → Sign up
2. Create a new Redis database → name it `twitchmetrics` → select region
3. Choose **Regional** (not Global) unless you need multi-region
4. Go to database details → **REST API** tab

### Data to Collect

```
UPSTASH_REDIS_REST_URL=https://[your-region-url].upstash.io
UPSTASH_REDIS_REST_TOKEN=AX...your-token...
```

> Do NOT use a standard `redis://` connection string here. Upstash REST URL must be the HTTPS endpoint. The existing code in `src/lib/redis.ts` uses `@upstash/redis` which requires this format.

---

## 3. Inngest — Background Job Orchestration

**URL:** https://inngest.com
**What it does:** Schedules and orchestrates all background jobs:

- Snapshot collection: tier1 (hourly), tier2 (every 6h), tier3 (daily), games
- OAuth token refresh
- Profile enrichment on claim
- Claim verification challenge
- Inactive creator demotion

### Registration Steps

1. Go to inngest.com → Sign up
2. Create a new app → name it `twitchmetrics`
3. Go to **Settings → API Keys**
4. Copy the **Event Key** (for publishing events)
5. Go to **Settings → Signing Keys** → copy the signing key (for webhook verification)

### Data to Collect

```
INNGEST_EVENT_KEY=evt_...your-event-key...
INNGEST_SIGNING_KEY=signkey-prod-...your-signing-key...
```

### After Vercel Deploy

Connect Inngest to your deployed app:

1. In Inngest dashboard → **Apps** → **Sync App**
2. Enter your app URL: `https://yourdomain.com/api/inngest`
3. Inngest will discover all 9 registered functions automatically

---

## 4. Twitch — OAuth + Data API

**URL:** https://dev.twitch.tv/console
**What it does:**

- User login (OAuth provider in Auth.js)
- Creator claiming via Twitch account
- Snapshot data: followers, stream status, viewer count, clips, channel info
- EventSub webhooks: stream.online, stream.offline, channel.update

### Registration Steps

1. Go to dev.twitch.tv/console → Log in with a Twitch account
2. **Applications** → **Register Your Application**
3. Fill in:
   - **Name:** TwitchMetrics (must be unique on Twitch)
   - **OAuth Redirect URLs:**
     - `http://localhost:3000/api/auth/callback/twitch` (dev)
     - `https://yourdomain.com/api/auth/callback/twitch` (prod)
   - **Category:** Website Integration
4. Click **Create** → then **Manage** on your app
5. Click **New Secret** → copy the secret immediately (shown once)

### Data to Collect

```
TWITCH_CLIENT_ID=abc123...your-client-id...
TWITCH_CLIENT_SECRET=xyz789...your-client-secret...
TWITCH_EVENTSUB_SECRET=any-random-string-you-choose-32-chars-min
```

> `TWITCH_EVENTSUB_SECRET` is a secret YOU choose (not given by Twitch). It's used to verify webhook signatures. Generate with: `openssl rand -hex 20`

### Scopes Used

- `user:read:email` — login, read email
- `channel:read:subscriptions` — subscription count
- `moderator:read:followers` — follower count (required since 2023)

---

## 5. Google / YouTube — OAuth + Data API

**URL:** https://console.cloud.google.com
**What it does:**

- User login via Google account (OAuth)
- YouTube channel data: subscribers, view count, video list
- YouTube Analytics: watch time, revenue metrics (for claimed creators)
- Bio verification via YouTube channel description

### Registration Steps

#### Step A — Create Project

1. Go to console.cloud.google.com → Create new project → name `twitchmetrics`
2. Select the project

#### Step B — Enable APIs

1. Go to **APIs & Services → Library**
2. Enable these two APIs:
   - **YouTube Data API v3** (search and channel data)
   - **YouTube Analytics API** (watch time, revenue for connected creators)

#### Step C — OAuth Credentials

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
2. Configure consent screen first if prompted:
   - App name: TwitchMetrics
   - User support email: your email
   - Developer contact: your email
   - Scopes: add `youtube.readonly`, `yt-analytics.readonly`, `openid`, `email`, `profile`
3. Application type: **Web Application**
4. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://yourdomain.com/api/auth/callback/google` (prod)
5. Click Create → copy Client ID and Client Secret

#### Step D — API Key (for public YouTube data)

1. Go to **APIs & Services → Credentials → Create Credentials → API Key**
2. Restrict to: YouTube Data API v3
3. Copy the key

### Data to Collect

```
GOOGLE_CLIENT_ID=123456789-abc...your-client-id....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...your-client-secret...
YOUTUBE_API_KEY=AIza...your-api-key...
```

> `YOUTUBE_API_KEY` is used for public channel lookups (no user auth required). The OAuth credentials are for users connecting their YouTube channel. The code tracks quota usage in-memory and warns at 80% of the 10,000 unit/day limit.

---

## 6. Resend — Transactional Email

**URL:** https://resend.com
**What it does:**

- Magic link authentication emails (passwordless login)
- Digest/notification emails to creators

### Registration Steps

1. Go to resend.com → Sign up
2. Go to **Domains → Add Domain** → add `twitchmetrics.net` (or your domain)
3. Follow DNS verification steps (add TXT/MX/DKIM records to your domain registrar)
4. Once verified, go to **API Keys → Create API Key**
5. Name it `twitchmetrics-production`
6. Select: **Full access** (or restrict to Sending access if preferred)

### Data to Collect

```
RESEND_API_KEY=re_...your-api-key...
```

> The from address in code is `TwitchMetrics <noreply@twitchmetrics.net>`. You must verify the `twitchmetrics.net` domain in Resend before emails will send.

---

## 7. Auth Secrets — Generate Locally

These are not from external services — you generate them yourself.

### NEXTAUTH_SECRET

```bash
openssl rand -base64 32
```

```
NEXTAUTH_SECRET=your-64-char-base64-string
NEXTAUTH_URL=https://yourdomain.com
```

> In production on Vercel, `NEXTAUTH_URL` is optional if Auth.js can detect the URL automatically. Still recommended to set it.

### ENCRYPTION_KEY

Used for AES-256-GCM encryption of OAuth tokens stored in the database.

```bash
openssl rand -hex 32
```

```
ENCRYPTION_KEY=64-character-hex-string
```

> This key encrypts all platform OAuth tokens (access + refresh tokens) at rest. If you lose or rotate this key, all connected platform tokens become unreadable and users must reconnect.

---

## 8. Vercel — App Hosting

**URL:** https://vercel.com
**What it does:** Hosts the Next.js app with Edge Middleware, serverless functions, ISR, and CDN.

### Registration Steps

1. Go to vercel.com → Sign up with GitHub
2. **Add New Project → Import Git Repository** → select the `twitchmetrics` repo
3. Configure:
   - **Root Directory:** `apps/web`
   - **Framework Preset:** Next.js (auto-detected)
   - **Node.js Version:** 20.x
4. Add all environment variables (see complete list at end of this doc)
5. Deploy

### After Deploy

- Note your production URL (e.g., `https://twitchmetrics.vercel.app` or custom domain)
- Update OAuth redirect URIs in Twitch, Google, Instagram, TikTok, Twitter with the production URL
- Sync Inngest with the production URL (`https://yourdomain.com/api/inngest`)
- Set `NEXTAUTH_URL=https://yourdomain.com`

---

## 9. Sentry — Error Tracking (Optional at Launch)

**URL:** https://sentry.io
**What it does:** Server-side and client-side error tracking, source map upload for readable stack traces.

### Registration Steps

1. Go to sentry.io → Sign up
2. Create new project → platform: **Next.js** → name it `twitchmetrics`
3. Copy the DSN shown on setup
4. Go to **Settings → Auth Tokens → Create Token** (for source map upload in CI)
5. Set scopes: `project:releases`, `org:read`

### Data to Collect

```
SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=sntrys_...your-auth-token...
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=twitchmetrics
```

> `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` should be the same value. The `NEXT_PUBLIC_` prefix exposes it to the browser bundle for client-side error capture.

---

## 10. Cloudflare R2 — File Storage (Optional at Launch)

**URL:** https://cloudflare.com
**What it does:** S3-compatible object storage for:

- Creator avatar uploads
- Media kit assets (banners, brand packages)
- Brand partner logos

> If you don't need file uploads on day 1, defer this. Avatars currently come directly from platform CDNs.

### Registration Steps

1. Go to cloudflare.com → Sign up / Log in
2. Go to **R2 Object Storage → Create Bucket**
3. Bucket name: `twitchmetrics-media`
4. Go to **R2 → Manage R2 API Tokens → Create API Token**
5. Permissions: **Object Read & Write** on your bucket
6. Copy Account ID from right sidebar
7. For a public URL: go to bucket → Settings → enable **Public Access** → copy the public URL

### Data to Collect

```
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=twitchmetrics-media
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

---

## 11. Twitter/X — OAuth + API (Optional at Launch)

**URL:** https://developer.twitter.com
**What it does:**

- User login via X account
- Creator profile data: followers, tweet metrics
- Bearer token for public API access without user auth

> **Cost warning:** X Basic API tier is $100/month minimum. Free tier is extremely limited. Evaluate if Twitter/X is worth the cost at launch.

### Registration Steps

1. Go to developer.twitter.com → Apply for access (requires phone-verified X account)
2. Create a new app/project
3. Go to **App Settings → Keys and Tokens**
4. Generate **OAuth 2.0 Client ID and Client Secret**
5. Add redirect URIs:
   - `http://localhost:3000/api/auth/callback/twitter`
   - `https://yourdomain.com/api/auth/callback/twitter`
6. Generate **Bearer Token** (app-only, for public API queries)

### Data to Collect

```
TWITTER_CLIENT_ID=your-oauth2-client-id
TWITTER_CLIENT_SECRET=your-oauth2-client-secret
TWITTER_BEARER_TOKEN=AAAAAAAAAAAAAAAAAAAAAyour-bearer-token
```

---

## 12. Instagram / Meta — OAuth (Requires Meta Review)

**URL:** https://developers.facebook.com
**What it does:** Creator login + Instagram profile data (followers, reach, engagement).

> **Warning:** Instagram API requires Meta App Review before you can access other users' data. This process takes weeks and requires a privacy policy, detailed use case description, and demo video. Plan for this lead time.

### Registration Steps

1. Go to developers.facebook.com → Create App
2. Type: **Business** → name it `TwitchMetrics`
3. Add **Instagram Basic Display** product
4. Go to **App Review → Request Permissions**: `instagram_basic`, `instagram_manage_insights`
5. Add redirect URIs:
   - `http://localhost:3000/api/auth/callback/instagram`
   - `https://yourdomain.com/api/auth/callback/instagram`
6. After review approval, get credentials from **Settings → Basic**

### Data to Collect

```
INSTAGRAM_CLIENT_ID=your-app-id
INSTAGRAM_CLIENT_SECRET=your-app-secret
```

---

## 13. TikTok — OAuth (Requires API Approval)

**URL:** https://developers.tiktok.com
**What it does:** Creator login + TikTok profile data (followers, video metrics).

> **Warning:** TikTok's developer program requires application and approval. The Login Kit + Research API requires separate approval. Timeline is unpredictable.

### Registration Steps

1. Go to developers.tiktok.com → Sign in with TikTok
2. Create app → apply for **Login Kit** access
3. Add redirect URIs once approved
4. Get Client Key and Client Secret from app dashboard

### Data to Collect

```
TIKTOK_CLIENT_KEY=your-client-key
TIKTOK_CLIENT_SECRET=your-client-secret
```

---

## 14. Kick — Deferred

**What it does:** Creator data from Kick platform. Webhook handler is implemented; OAuth is deferred pending Kick's public API availability.

### Data to Collect (when ready)

```
KICK_CLIENT_ID=your-client-id
KICK_CLIENT_SECRET=your-client-secret
KICK_WEBHOOK_SECRET=any-string-you-choose-for-signature-verification
```

---

## ⚠️ Known Architecture Note — BullMQ vs Inngest

The codebase contains two background job systems:

- **Inngest** (9 fully implemented functions in `src/inngest/functions/`) — the primary system
- **BullMQ** (`src/server/queue/`) — requires a standard TCP Redis via `REDIS_URL`

**On Vercel (serverless), BullMQ workers cannot run** — Vercel functions terminate after 60s and can't maintain persistent worker processes.

Since all jobs (snapshots, enrichment, token refresh, claim verification) are already implemented in Inngest, **BullMQ should be treated as unused/legacy code**. Do not provision a separate Redis for BullMQ. Use Inngest exclusively.

If BullMQ is ever needed in the future, it would require a persistent server (Railway, Fly.io, or an EC2 instance) — not Vercel.

---

## Complete Environment Variables Reference

Copy this to your `.env.local` (dev) and Vercel environment settings (prod).

```bash
# ─── Site ──────────────────────────────────────────────────
NEXT_PUBLIC_SITE_URL=https://twitchmetrics.net
NEXTAUTH_URL=https://twitchmetrics.net

# ─── Database (Neon) ───────────────────────────────────────
DATABASE_URL=postgresql://[user]:[password]@[host]-pooler.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://[user]:[password]@[host].neon.tech/neondb?sslmode=require

# ─── Auth Secrets (Generate locally) ───────────────────────
NEXTAUTH_SECRET=                    # openssl rand -base64 32
ENCRYPTION_KEY=                     # openssl rand -hex 32

# ─── Upstash Redis ─────────────────────────────────────────
UPSTASH_REDIS_REST_URL=https://[region].upstash.io
UPSTASH_REDIS_REST_TOKEN=

# ─── Inngest ───────────────────────────────────────────────
INNGEST_EVENT_KEY=evt_...
INNGEST_SIGNING_KEY=signkey-prod-...

# ─── Twitch [REQUIRED] ─────────────────────────────────────
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_EVENTSUB_SECRET=             # openssl rand -hex 20

# ─── Google / YouTube [REQUIRED] ───────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
YOUTUBE_API_KEY=

# ─── Resend [REQUIRED] ─────────────────────────────────────
RESEND_API_KEY=re_...

# ─── Sentry [OPTIONAL] ─────────────────────────────────────
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=twitchmetrics

# ─── Cloudflare R2 [OPTIONAL AT LAUNCH] ────────────────────
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=twitchmetrics-media
NEXT_PUBLIC_R2_PUBLIC_URL=

# ─── Twitter/X [OPTIONAL AT LAUNCH] ───────────────────────
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
TWITTER_BEARER_TOKEN=

# ─── Instagram [REQUIRES META REVIEW] ──────────────────────
INSTAGRAM_CLIENT_ID=
INSTAGRAM_CLIENT_SECRET=

# ─── TikTok [REQUIRES API APPROVAL] ───────────────────────
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

# ─── Kick [DEFERRED] ───────────────────────────────────────
KICK_CLIENT_ID=
KICK_CLIENT_SECRET=
KICK_WEBHOOK_SECRET=

# ─── Logging ───────────────────────────────────────────────
LOG_LEVEL=info

# ─── Dev overrides ─────────────────────────────────────────
# CLAIM_BIO_VERIFY_DEV_BYPASS=true
# LEGACY_DATABASE_URL=                # one-time migration only
```

---

## What's NOT Needed (Removed from Old Plan)

| Old service                                                         | Why removed                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **AWS** (ECS, ECR, ALB, Route 53, ACM, Secrets Manager, CloudWatch) | Replaced by Vercel                                                                       |
| **Supabase** (PostgreSQL + RLS + Supabase Auth)                     | PostgreSQL replaced by Neon; Supabase Auth was never used; RLS bypassed by Prisma anyway |
| **BullMQ Redis** (`REDIS_URL` TCP connection)                       | Can't run on Vercel serverless; Inngest handles all background jobs                      |

Supabase Realtime (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) remains a future option if push-based real-time features are added, but is not needed at launch.
