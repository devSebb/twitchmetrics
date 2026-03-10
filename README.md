# TwitchMetrics

Creator analytics platform — unified dashboard, media kit builder, and cross-platform growth tracking.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Monorepo:** Turborepo + pnpm workspaces
- **Database:** Supabase PostgreSQL + Prisma ORM
- **Auth:** Auth.js v5 (multi-provider OAuth)
- **API:** tRPC v11 (end-to-end type safety)
- **Background Jobs:** Inngest (cron-based snapshots)
- **Rate Limiting:** Upstash Redis
- **Deployment:** Vercel

## Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase project

## Setup

```bash
pnpm install
cp .env.example .env.local    # Fill in your values
pnpm db:generate              # Generate Prisma client
pnpm db:migrate               # Run migrations (uses DIRECT_URL)
pnpm db:seed                  # Seed development data
pnpm dev                      # Start development server
```

## Project Structure

```
twitchmetrics/
├── apps/
│   └── web/                   # Next.js 15 application
├── packages/
│   ├── database/              # Prisma schema + client
│   ├── ui/                    # Shared UI components
│   └── config/                # Shared TS, Tailwind, ESLint configs
├── turbo.json
└── package.json
```

## Architecture Notes

- `DATABASE_URL` (port 6543) for pooled queries, `DIRECT_URL` (port 5432) for migrations
- OAuth tokens are AES-256-GCM encrypted before database storage
- Background snapshots run via Inngest cron functions
- Public pages are SSR for SEO, dashboard pages are client-rendered with tRPC
