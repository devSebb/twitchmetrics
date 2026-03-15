# Stage 4 — Quality Hardening & QA Closure

> **Scope:** Dashboard media kit parity, settings completeness, regression checks, acceptance evidence, environment matrix, release-readiness checklist
> **Priority:** Quality gate — complete before shipping Stage 4 as "done"
> **Tasks:** C.1–C.3, D.1–D.3

---

## Architecture Context

### Dashboard routing & authentication

```
Middleware (src/middleware.ts) guards:
  /dashboard/:path*
  /home, /analytics, /claim, /connections
  /media-kit, /settings/:path*
  /roster/:path*

Unauthenticated → redirect to /login?returnTo=...
Authenticated → pass through to page
```

**Roles** (from `UserRole` enum): `creator`, `talent_manager`, `brand`, `admin`

### Dashboard page structure

| Route          | Component                                | Role           | Purpose                         |
| -------------- | ---------------------------------------- | -------------- | ------------------------------- |
| `/dashboard`   | `src/app/(dashboard)/dashboard/page.tsx` | creator        | Main dashboard with widget grid |
| `/settings`    | `src/app/(dashboard)/settings/page.tsx`  | creator        | Profile settings                |
| `/connections` | Connection management                    | creator        | OAuth platform connections      |
| `/media-kit`   | Media kit page                           | creator        | Shareable media kit             |
| `/roster`      | Manager dashboard                        | talent_manager | Manage creator roster           |

### Widget system

- **10 widgets** defined in `src/lib/constants/widgets.ts`
- **WidgetToggle** drawer: `src/components/dashboard/WidgetToggle.tsx` — slide-out, debounced persistence
- **DashboardGrid**: `src/components/dashboard/DashboardGrid.tsx` — responsive 3/2/1 col layout
- **Widget config** stored as `widgetConfig Json @default("[]")` on `CreatorProfile`
- **tRPC procedure**: `creator.updateWidgetConfig` persists changes

### Key component paths

```
src/components/widgets/
  ├── StatsRow.tsx              # P0 — KPI cards + sparklines
  ├── FollowerGrowthWidget.tsx  # P0 — Line chart with platform tabs
  ├── ViewerCountWidget.tsx     # P0 — Area chart with live indicator
  ├── DemographicsWidget.tsx    # P0 — Gender donut + age/country bars
  ├── PopularGamesWidget.tsx    # P0 — Game cards with cover art
  ├── PlatformBreakdownWidget.tsx  # P1 — Horizontal bar chart
  ├── RecentStreamsWidget.tsx    # P1 — Sortable paginated table
  ├── FeaturedClipsWidget.tsx   # P1 — 2x3 clip thumbnail grid
  ├── BrandPartnersWidget.tsx   # P1 — Logo grid (editable by owner)
  ├── BrandSafetyWidget.tsx     # P2 — Semi-circle gauge
  └── EmptyState.tsx            # no_data + locked variants
```

### Design tokens (Figma V7)

- Background: `#2B2D31`
- Surface: `#313338`
- Border: `#3F4147`
- Muted text: `#8B8E94`
- Brand red: `#E32C19`

---

## C.1 — Dashboard Media Kit Route Parity

### Goal

Verify the dashboard media kit matches the public media kit quality bar.

### What to check

1. **Public media kit page** — Located at `/creators/[slug]/media-kit` or similar. Should display:
   - Creator name, avatar, banner
   - Key stats (followers, views, avg viewers across platforms)
   - Platform breakdown
   - Demographics (if claimed)
   - Top games
   - Brand partners

2. **Dashboard media kit** — Check if there's a `/dashboard/media-kit` or `/media-kit` route under `(dashboard)`.

### Action items

Search for media kit routes:

```bash
find src/app -name "*.tsx" -path "*media*"
```

Check `src/components/media-kit/` for shared components.

**If dashboard links to public media kit:** Verify the link is correct and the public page is accessible.

**If dashboard has its own media kit page:** Ensure it shows the same data quality as the public version.

**Document the decision:** In a comment at the top of the media kit page component, note whether the dashboard uses its own page or links to the public one.

### DO NOT

- Do not create a duplicate media kit page if one already exists
- Do not add features beyond what Stage 4 defined

---

## C.2 — Settings Completeness

### Goal

Verify the creator settings page covers Stage 4 intent.

### File to check

`src/app/(dashboard)/settings/page.tsx` (and any sub-routes like `/settings/profile`, `/settings/privacy`)

### Required settings (Stage 4 scope)

1. **Widget visibility** — Check if widget toggle exists in settings or in the dashboard drawer (WidgetToggle.tsx). Either location is acceptable. Document the product decision.

2. **Profile privacy toggles** — Should allow creators to:
   - Hide/show demographics data on public profile
   - Control whether profile appears in search results
   - These persist to `CreatorProfile` fields

3. **Account data export** (GDPR compliance) — At minimum:
   - A "Request Data Export" button that sends an email to support
   - Or a link to the data export process
   - Full implementation is a separate feature; a stub/CTA is acceptable for Stage 4

### Implementation if missing

If privacy toggles don't exist, add minimal implementation:

```typescript
// In settings page or a new SettingsPrivacy component
const privacySettings = [
  {
    key: "showDemographics",
    label: "Show demographics on public profile",
    default: true,
  },
  { key: "showInSearch", label: "Appear in search results", default: true },
];
```

These can store in `CreatorProfile.widgetConfig` JSON field (reuse existing JSON column) or in a new `settings Json` field (requires migration — avoid if possible for Stage 4).

### DO NOT

- Do not add a new Prisma migration for settings — reuse `widgetConfig` JSON or defer
- Do not implement full GDPR data export pipeline — a stub CTA is sufficient

---

## C.3 — Dashboard Interaction Regression Checks

### Goal

Create a manual regression test checklist for dashboard behavior.

### File to create

`docs/dashboard-regression-checklist.md`

### Content

```markdown
# Dashboard Regression Checklist

Run these checks after any dashboard changes. All checks should pass before merging.

## Widget Toggle Persistence

- [ ] Toggle a widget OFF in the drawer → refresh page → widget is still OFF
- [ ] Toggle the widget back ON → refresh page → widget is still ON
- [ ] Open drawer → toggle multiple widgets → close drawer → refresh → all changes persist

## Empty / Locked States

- [ ] View dashboard as unclaimed creator → widgets show "locked" or "no data" states
- [ ] View dashboard as claimed creator with no snapshots → widgets show "no data" EmptyState
- [ ] No JavaScript errors in console for any empty state

## Chart Rendering

- [ ] Creator with data from ONE platform only → charts render without errors
- [ ] Creator with data from MULTIPLE platforms → multi-line chart renders correctly
- [ ] Creator with data gaps (sparse time series) → chart handles gaps gracefully (no NaN, no crashes)
- [ ] Period selector (7d/30d/90d) → chart updates without flicker

## Role-Based Routing

- [ ] Unauthenticated user → `/dashboard` redirects to `/login`
- [ ] Creator role → `/dashboard` shows dashboard
- [ ] Talent manager role → `/roster` shows manager interface
- [ ] Creator → `/roster` redirects or shows unauthorized

## StatsRow

- [ ] All 6 KPI cards render with data (or "—" for missing)
- [ ] Sparklines render for metrics with history
- [ ] Trend arrows show correct direction (up/down/flat)

## Brand Partners Widget (if owner)

- [ ] Can add a new brand partner
- [ ] Can remove an existing brand partner
- [ ] Logo displays or fallback letter avatar shows
- [ ] Max 12 partners enforced

## Featured Clips Widget

- [ ] Clip thumbnails load from Twitch CDN
- [ ] "No clips" state shows if no clips available
- [ ] Clicking a clip opens Twitch in new tab

## General

- [ ] `pnpm build` succeeds with no errors
- [ ] No console errors when navigating between dashboard pages
- [ ] Mobile responsive: grid collapses to 1 column on mobile
- [ ] BigInt serialization: no "Cannot serialize BigInt" errors
```

### Optional: Playwright/Cypress tests

If the project has a test framework set up, add automated versions of the critical paths:

- Widget toggle persistence (toggle → refresh → assert)
- Role-based routing (unauthenticated redirect)
- Dashboard page loads without errors

Check for existing test setup:

```bash
ls apps/web/tests/ apps/web/e2e/ apps/web/cypress/ 2>/dev/null
```

---

## D.1 — Stage 4 Acceptance Evidence Artifact

### Goal

Create documentation proving Stage 4 is complete.

### File to create

`docs/stage-4-acceptance-evidence.md`

### Template

````markdown
# Stage 4 Acceptance Evidence

**Date:** 2026-03-14
**Stage:** Stage 4 — Dashboard, Widgets & Multi-Platform
**Status:** Complete (19/19 tasks)

## 1. Widget Screenshots

| Widget                  | Screenshot                | Status                                   |
| ----------------------- | ------------------------- | ---------------------------------------- |
| StatsRow                | [screenshot path or link] | ✅ Implemented                           |
| FollowerGrowthWidget    | [screenshot]              | ✅ Implemented                           |
| ViewerCountWidget       | [screenshot]              | ✅ Implemented                           |
| DemographicsWidget      | [screenshot]              | ✅ Implemented (access-gated)            |
| PopularGamesWidget      | [screenshot]              | ✅ Implemented                           |
| PlatformBreakdownWidget | [screenshot]              | ✅ Implemented                           |
| RecentStreamsWidget     | [screenshot]              | ✅ Implemented                           |
| FeaturedClipsWidget     | [screenshot]              | ✅ Implemented                           |
| BrandPartnersWidget     | [screenshot]              | ✅ Implemented                           |
| BrandSafetyWidget       | [screenshot]              | ✅ Implemented (P2, disabled by default) |

## 2. Sample API Payloads

### GET /api/creators/[slug]

```json
{
  "data": {
    "id": "...",
    "slug": "ninja",
    "displayName": "Ninja",
    "totalFollowers": "18500000",
    "snapshotTier": "tier1",
    "platformAccounts": [...]
  }
}
```
````

### GET /api/creators/[slug]/snapshots?period=7d

```json
{
  "data": [
    { "snapshotAt": "2026-03-14T00:00:00Z", "followerCount": "18500000", "platform": "twitch" },
    ...
  ]
}
```

## 3. Role-Based Route Checks

| Role            | Route      | Expected                | Verified |
| --------------- | ---------- | ----------------------- | -------- |
| Unauthenticated | /dashboard | Redirect to /login      | ☐        |
| Creator         | /dashboard | 200 — Dashboard grid    | ☐        |
| Creator         | /settings  | 200 — Settings page     | ☐        |
| Creator         | /media-kit | 200 — Media kit         | ☐        |
| Talent Manager  | /roster    | 200 — Manager interface | ☐        |
| Admin           | /dashboard | 200 — Dashboard         | ☐        |

## 4. Dashboard SEO / Indexing

- [ ] Dashboard routes have `noindex` meta tag or are excluded in `robots.txt`
- [ ] Public profile pages ARE indexed
- [ ] Sitemap does NOT include /dashboard/\* routes

````

### Instructions for the agent

1. Fill in the template with actual data from the running app
2. Take screenshots if possible (or note "screenshot pending")
3. Make actual API calls and paste redacted responses
4. Check each role-based route manually or via test script

---

## D.2 — Environment Matrix for Conditional Providers

### Goal

Document which OAuth providers are actually configured and usable.

### File to create

`docs/environment-matrix.md`

### Content

```markdown
# Environment Matrix — OAuth & API Providers

**Last updated:** 2026-03-14

| Provider | Platform | Status | Client ID Set | App Approved | Notes |
|----------|----------|--------|--------------|-------------|-------|
| Twitch | twitch | ☐ Ready / ☐ Not configured | ☐ | ☐ | |
| Google (YouTube) | youtube | ☐ Ready / ☐ Not configured | ☐ | ☐ | YouTube Data API v3 enabled? |
| Instagram (Meta) | instagram | ☐ Ready / ☐ Pending approval | ☐ | ☐ | Requires Facebook Page link |
| TikTok | tiktok | ☐ Ready / ☐ Pending approval | ☐ | ☐ | Login Kit + Display API review |
| X (Twitter) | x | ☐ Ready / ☐ Not configured | ☐ | ☐ | Basic tier ($100/mo) |
| Kick | kick | ☐ Unavailable | N/A | N/A | No official API/OAuth |

## API Keys (Non-OAuth)

| Service | Env Variable | Status | Notes |
|---------|-------------|--------|-------|
| YouTube Data API | `YOUTUBE_API_KEY` | ☐ Set / ☐ Missing | For public data (no OAuth needed) |
| X Bearer Token | `X_BEARER_TOKEN` | ☐ Set / ☐ Missing | For public metrics |

## Infrastructure

| Service | Env Variables | Status |
|---------|-------------|--------|
| Database (Supabase) | `DATABASE_URL`, `DIRECT_URL` | ☐ Configured |
| Redis (Upstash) | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | ☐ Configured |
| Inngest | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | ☐ Configured |
| Sentry | `SENTRY_DSN` | ☐ Configured / ☐ Missing |
| R2 Storage | `R2_*` variables | ☐ Configured / ☐ Missing |
| Auth | `NEXTAUTH_SECRET`, `ENCRYPTION_KEY` | ☐ Configured |
| Email (Resend) | `RESEND_API_KEY` | ☐ Configured / ☐ Missing |
````

### Instructions

Fill in this matrix by checking `.env.local` and `.env.example`. Update whenever a provider is enabled or disabled.

---

## D.3 — Release-Readiness Checklist for Stage 4

### Goal

Create a compact yes/no gate checklist to prevent status drift.

### File to create

`docs/stage-4-release-checklist.md`

### Content

```markdown
# Stage 4 Release-Readiness Checklist

All items must be checked before declaring Stage 4 complete.

## Code Completeness

- [ ] Stage 4 status in `src/App.jsx` is `"done"`
- [ ] Stage-4 doc progress shows 19/19 (100%)
- [ ] All 10 dashboard widgets render (P0 + P1 + P2)
- [ ] Widget toggle drawer works (persist on refresh)
- [ ] YouTube adapter + snapshot worker functional

## Pipeline Integrity

- [ ] Vertical slice test passes (snapshot → rollup → API)
- [ ] Twitch snapshot worker runs without errors
- [ ] YouTube snapshot worker runs without errors
- [ ] Growth rollup worker computes correct deltas

## Dashboard Quality

- [ ] Dashboard loads for a claimed creator with data
- [ ] Empty/locked states render for unclaimed creators
- [ ] Multi-platform charts render without crashes
- [ ] Mobile responsive layout (3 → 2 → 1 cols)
- [ ] BigInt serialization: no JSON errors

## Features

- [ ] Media kit page accessible and functional
- [ ] Manager dashboard (talent_manager role) works
- [ ] Settings page has widget visibility controls
- [ ] Creator profile page shows growth data

## Infrastructure

- [ ] `pnpm build` succeeds with zero errors
- [ ] Dashboard routes have `noindex` (not indexed by search engines)
- [ ] Environment matrix documented
- [ ] Acceptance evidence artifact created

## Documentation

- [ ] Vertical slice test results documented
- [ ] Dashboard regression checklist created
- [ ] SLO for data freshness defined
- [ ] CHANGELOG updated with Stage 4 completion
```

---

## Execution order

1. **C.1** — Check media kit parity (quick audit)
2. **C.2** — Verify settings completeness (may need small additions)
3. **D.2** — Fill in environment matrix (audit `.env.local`)
4. **D.1** — Create acceptance evidence (requires running app)
5. **C.3** — Create regression checklist (document only)
6. **D.3** — Create release-readiness checklist and check off items

---

## Validation checklist

- [ ] Media kit route exists and renders (public or dashboard)
- [ ] Settings page has widget visibility + privacy toggles (or documented decision)
- [ ] `docs/dashboard-regression-checklist.md` exists
- [ ] `docs/stage-4-acceptance-evidence.md` exists with filled template
- [ ] `docs/environment-matrix.md` exists with current provider status
- [ ] `docs/stage-4-release-checklist.md` exists with all items checkable
- [ ] `pnpm build` succeeds
