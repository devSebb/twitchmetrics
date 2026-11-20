# Data ingestion: where the code lives

A guide for walking the team through the code. Every reference is `path:line`. In Cursor, press Cmd+P and paste it to jump straight to the line.

---

## 1. The 30-second mental model

```
 SOURCES                         RUNNERS                          CODE                          TABLES
 ───────                         ───────                          ────                          ──────
 AWS S3 (Stream Hatchet files) ─► GitHub Actions (cron) ─► workers/*.ts  ─────────────► Postgres (Neon)
 Stream Hatchet live API ───────► Inngest (cron, on Vercel) ─► apps/web/src/inngest/** ─► same DB
 Twitch / YouTube / Kick / X API ► Inngest (cron)          ─► apps/web/src/server/adapters/*
 IGDB (game metadata) ──────────► Inngest (cron)
```

- **Heavy batch jobs** (the S3 files, which are tens of thousands of rows a day) run on **GitHub Actions** as plain Node scripts in `workers/`. They were moved off Inngest because Vercel kills any step after 300 s.
- **Light, frequent jobs** (live API polling every 30–60 min) run on **Inngest**, as functions in `apps/web/src/inngest/functions/`.
- **Shared logic** used by both runners lives in `packages/core/src/rollups/` (how raw streams become daily numbers).

## 2. Folder map

| Folder                                        | What's in it                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `.github/workflows/`                          | **Schedules** for the batch jobs (cron plus the exact command each one runs)                     |
| `workers/`                                    | Batch ingestion scripts (S3 imports, catalog, followers, demographics, repairs)                  |
| `workers/lib/streamhatchet-daily-sessions.ts` | S3 download and CSV parsing for the daily sessions files                                         |
| `packages/core/src/rollups/`                  | Turns stream rows into daily rollups (per channel, game, and creator)                            |
| `apps/web/src/inngest/functions/index.ts`     | **Registry of every Inngest job.** If a job isn't listed here, it doesn't run                    |
| `apps/web/src/inngest/functions/snapshots/`   | Live polling jobs (games, Stream Hatchet API, creator tiers)                                     |
| `apps/web/src/server/adapters/`               | One API client per platform: `twitch.ts`, `youtube.ts`, `kick.ts`, `x.ts`, `streamhatchet.ts`, … |
| `apps/web/src/server/services/streamhatchet/` | Stream Hatchet helpers shared with the workers (game names, YouTube game snapshots)              |
| `packages/database/prisma/schema.prisma`      | Table definitions (the line numbers for each table are listed below)                             |

## 3. What runs, when

| Pipeline                                   | Runner  | Schedule (UTC)            | Defined at                                                                     |
| ------------------------------------------ | ------- | ------------------------- | ------------------------------------------------------------------------------ |
| A. Stream sessions from S3 (all platforms) | GitHub  | daily 01:15               | `.github/workflows/sh-daily-sessions.yml:48`                                   |
| B. Minutes per game from S3                | GitHub  | same job, step 1b         | `.github/workflows/sh-daily-sessions.yml:105`                                  |
| C. Followers refresh from S3               | GitHub  | Mondays 08:30             | `.github/workflows/sh-follower-freshness.yml:45`                               |
| D. Social links (IG/TikTok/X) from S3      | GitHub  | 1st of month              | `.github/workflows/sh-follower-freshness.yml:46`                               |
| E. **Audience demographics from S3**       | GitHub  | 2nd of month              | `.github/workflows/sh-follower-freshness.yml:47`                               |
| F. Catalog catch-up + enrichment           | GitHub  | Sundays 06:00             | `.github/workflows/sh-follower-freshness.yml:48`                               |
| G. Re-exported file sweep                  | GitHub  | Sundays 02:00             | `.github/workflows/sh-regenerated-files.yml:26`                                |
| H. Twitch games (live viewers)             | Inngest | every 30 min              | `apps/web/src/inngest/functions/snapshots/game-snapshot.ts:307`                |
| I. Stream Hatchet live games               | Inngest | hourly :25                | `apps/web/src/inngest/functions/snapshots/streamhatchet-game-snapshot.ts:1003` |
| I. Stream Hatchet live channels            | Inngest | hourly :45                | `apps/web/src/inngest/functions/snapshots/streamhatchet-game-snapshot.ts:865`  |
| I. Stream Hatchet game discovery           | Inngest | every 6 h                 | `apps/web/src/inngest/functions/snapshots/streamhatchet-game-snapshot.ts:769`  |
| J. Kick categories                         | Inngest | hourly / 6 h              | `apps/web/src/inngest/functions/snapshots/kick-category-snapshot.ts:128`       |
| K. Game discovery (Twitch) + IGDB metadata | Inngest | 05:00 / 05:30             | `discovery/discover-games.ts:27`, `enrichment/enrich-games.ts:31`              |
| L. Creator API snapshots tier 1/2/3        | Inngest | every 6 h / 02:00 / 03:00 | `snapshots/tier1-snapshot.ts:10` (tier2, tier3 likewise)                       |
| L. Kick channel snapshots                  | Inngest | every 3 h                 | `snapshots/kick-channel-snapshot.ts:166`                                       |

---

## 4. The pipelines

### A. Stream sessions from AWS S3: the core pipeline

**Purpose:** every stream on Twitch, YouTube, and Kick, with airtime, average and peak viewers, minutes watched, and games. Everything on profile stats and game pages that covers 30D/3M/1Y is built from this.

**Source:** `s3://streamhatchet-aggregations/daily_sessions/summary/year=YYYY/month=MM/day=DD/{twitch|yt|kick}/basic.csv`, one CSV per platform per day. Stream Hatchet writes each day's file at about 23:07 UTC.

| Step                                                                                          | Where                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Schedule and order of steps (kick → yt → twitch → games → rollups → health check)             | `.github/workflows/sh-daily-sessions.yml:19-31` (header), steps at `:87`, `:92`, `:97`                                              |
| Entry point / CLI flags                                                                       | `workers/streamhatchet-ingest.ts:815` (`main`), flag docs at `:1-42`                                                                |
| Builds the S3 key                                                                             | `workers/lib/streamhatchet-daily-sessions.ts:87`                                                                                    |
| Imports one day (head → row count → download → parse → write)                                 | `workers/streamhatchet-ingest.ts:433` (`importOneDate`)                                                                             |
| Downloads from S3 (uses the `aws` CLI)                                                        | `workers/lib/streamhatchet-daily-sessions.ts:159`                                                                                   |
| Parses the CSV; maps each row to a session                                                    | `workers/lib/streamhatchet-daily-sessions.ts:375`, row mapping at `:303`                                                            |
| Matches a channel to our creator                                                              | `workers/streamhatchet-ingest.ts:304` and `:346`                                                                                    |
| Writes rows to `StreamSessionFact` (upsert, because one long stream appears in several files) | `workers/streamhatchet-ingest.ts:650-661` → `packages/core/src/rollups/facts.ts:189`                                                |
| Rebuilds the daily rollups                                                                    | `packages/core/src/rollups/persist.ts:109` (`recomputeRollups`) → math in `packages/core/src/rollups/build.ts:223` (`buildRollups`) |
| Cross-platform creator rollup (merged airtime)                                                | `packages/core/src/rollups/persist.ts:194` → `packages/core/src/rollups/creator.ts:106`                                             |
| Health check (fails the run if data is missing)                                               | `workers/check-ingestion-health.ts:88`, rules at `:1-40`                                                                            |

**Writes to:** `StreamHatchetSourceObject` (one row per S3 file, used to track import status), `StreamSessionFact` (raw streams), then `ChannelDailyRollup`, `GameDailyRollup`, `ChannelGameDailyRollup`, `CreatorDailyRollup`.

### B. Minutes per game from AWS S3

**Purpose:** the sessions file says _which_ games a stream had, not _for how long_. Without this file every stream is split equally between its games. This worker reads Stream Hatchet's per-game file so that, for example, xQc's 30 days come out about 90 % GTA V instead of 50/50.

**Source:** `s3://streamhatchet-aggregations/daily_sessions_games/sessions_games/{platform}/day/…csv` (lands about 02:00 UTC the next day).

| Step                                                                 | Where                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Explanation                                                          | `workers/streamhatchet-game-minutes.ts:1-25`                                     |
| Reads the per-game stretches                                         | `workers/streamhatchet-game-minutes.ts:194` (`readSegments`)                     |
| Processes one day (matches stretches to our streams, stores minutes) | `workers/streamhatchet-game-minutes.ts:264` (`processDay`)                       |
| How rollups use the stored minutes                                   | `packages/core/src/rollups/game-minutes.ts:134` (`assignSegmentsToFacts`), `:57` |

**Writes to:** `StreamSessionFact.gameMinutesByDay`, then rebuilds the game rollups.

### C, D, E. Social profiles export from AWS S3: followers, social links, demographics

**One worker, three modes:** `workers/streamhatchet-ingest-social-profiles.ts`. The mode is picked in `main` at `:1977`.

**Source:** a daily Parquet export of Stream Hatchet's database at `s3://streamhatchet-social-profiles-data/PostgreSQL-export/<snapshot>/partner_evaluator/`. It's read with **DuckDB** straight from S3. It never reads the token/secret columns (`:15-17`).

| Mode (flag)                    | Purpose                                                                                                                         | Code                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `--refresh-followers` (weekly) | Updates follower counts for the Twitch/YT/Kick accounts we don't poll by API, and builds follower history                       | branch at `:2009` → `refreshFollowersFromExport` `:1509`, history at `:1464` |
| `--social-links` (monthly)     | Attaches each creator's IG/TikTok/X handles and follower counts                                                                 | branch at `:2086` → `attachSocialLinks` `:928`                               |
| **`--demographics` (monthly)** | **Audience age/gender/country/income per creator, per social network**                                                          | branch at `:2029` → see below                                                |
| _(no flag)_                    | Identity: merges our duplicate profiles that Stream Hatchet says are one person (`contact_id`), and fills in country/gender/age | `buildPlan` `:433` → `applyPlan` `:654`                                      |

**Demographics, step by step** (the example to show the team):

1. Pulls the `contact_demographics` table from S3, keeping only DemographicsPro + successful + latest report: `extractDemographics` at `:1702` (filter at `:1722-1723`).
2. Exports our accounts and joins report → social profile → SH contact → our creator: `buildDemographicsPlan` at `:1758`.
3. Fills missing buckets with zeros, then upserts one row per (creator, network): `applyDemographics` at `:1798`, writes at `:1903` (new rows) and `:1913` (updates).
4. Table: `AudienceDemographics` (`packages/database/prisma/schema.prisma:378`).

### F. Catalog: turning Stream Hatchet channels into creator profiles

**Purpose:** any channel that shows up in the S3 sessions but has no profile gets a `CreatorProfile` + `PlatformAccount`. Then the job decides who is "listed" (public), and fills avatars and activity.

| Step                                                           | Where                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Weekly job definition                                          | `.github/workflows/sh-follower-freshness.yml:185` (catch-up), `:216` (enrich)    |
| Finds channels with no profile; creates them                   | `workers/streamhatchet-build-catalog.ts:316` (`loadCandidates`), `:624` (`main`) |
| Links that channel's existing facts/rollups to the new profile | `workers/streamhatchet-build-catalog.ts:503` (`backfillOwnership`)               |
| Listing gate (≥ 2 active days in last 30)                      | `workers/reconcile-creator-listing.ts:57`                                        |
| Avatars (Twitch/Kick API) + activity/primary game              | `workers/enrich-sh-profiles.ts:335`, `:404`, `:586`                              |

### Games (pipelines H–K and the S3 parts)

Game pages are fed from **five** places. This is the part that confuses people most:

| Data                                                                       | Source                                   | Code                                                                                                                              | Table                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Live viewers/channels per game, every 30 min (**Twitch**)                  | Twitch Helix API                         | `snapshots/game-snapshot.ts:305` → `snapshotTrackedGame` `:211`; API calls `server/adapters/twitch.ts:816`, `:851`                | `GameViewerSnapshot`, `GameTopChannel`, `GameBroadcastLanguage` |
| Live viewers per game per platform (**Twitch/YT/Kick**)                    | Stream Hatchet live API                  | `snapshots/streamhatchet-game-snapshot.ts:1001` → `persistLiveGameRows` `:655`; API client `server/adapters/streamhatchet.ts:280` | `GamePlatformViewerSnapshot`                                    |
| Top live channels per game; also refreshes follower counts                 | Stream Hatchet live API                  | `streamhatchet-game-snapshot.ts:862` → `persistLiveChannels` `:544`, `syncFollowersFromLiveChannels` `:444`                       | `GameTopChannel`, `MetricSnapshot`                              |
| **YouTube** daily average per game (fallback until the live feed has data) | our yt `GameDailyRollup` from pipeline A | `workers/write-yt-game-snapshots.ts:60` → `server/services/streamhatchet/daily-game-platform.ts:74`                               | `GamePlatformViewerSnapshot` (source `streamhatchet_daily`)     |
| Kick categories → our games                                                | Kick API                                 | `snapshots/kick-category-snapshot.ts:126` → `server/services/kick-category-metrics.ts:556`                                        | `PlatformGameMapping`, snapshots                                |
| New games + metadata (cover, genres, developer)                            | Twitch top 100 + IGDB                    | `discovery/discover-games.ts:40`, `enrichment/enrich-games.ts:73`; IGDB client `server/services/igdb.ts:48`                       | `Game`                                                          |
| Historical per-game totals (30D/1Y)                                        | pipelines A + B                          | `packages/core/src/rollups/build.ts:223`                                                                                          | `GameDailyRollup`, `ChannelGameDailyRollup`                     |

(`snapshots/` = `apps/web/src/inngest/functions/snapshots/`, and likewise for `discovery/` and `enrichment/`.)

### L. Creator snapshots from the platform APIs (Twitch, YouTube, Kick, X, TikTok, IG)

**Purpose:** fresh follower counts, live status, and profile data for creators we poll directly. Tier 1 is big creators (every 6 h); tiers 2 and 3 are daily.

| Step                                                        | Where                                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cron wrappers                                               | `apps/web/src/inngest/functions/snapshots/tier1-snapshot.ts:10` (tier2/tier3 same shape)                                                               |
| Main loop (loads the tier, batches, time budget)            | `apps/web/src/inngest/functions/snapshots/shared.ts:259` (`runTierSnapshot`)                                                                           |
| One account: picks the adapter → fetches → writes           | `apps/web/src/inngest/functions/snapshots/shared.ts:638`; adapter chosen at `:664`; write at `:690`                                                    |
| Platform → adapter map                                      | `apps/web/src/server/adapters/index.ts:10`                                                                                                             |
| Each platform's API call                                    | `adapters/twitch.ts:700`, `adapters/youtube.ts:318`, `adapters/kick.ts:491`, `adapters/x.ts:170`, `adapters/tiktok.ts:206`, `adapters/instagram.ts:47` |
| Same job runnable on GitHub (manual, migration in progress) | `workers/run-job.ts`, `.github/workflows/creator-snapshots.yml`                                                                                        |

**Writes to:** `MetricSnapshot` (`schema.prisma:488`), and updates `PlatformAccount` / `CreatorProfile`.

---

## 5. Safety nets

| What                                                                    | Where                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Daily data health check (reads the DB itself; doesn't trust run status) | `workers/check-ingestion-health.ts`                                            |
| Picks up S3 files Stream Hatchet re-exported; refuses truncated ones    | `--refresh-regenerated`, documented at `workers/streamhatchet-ingest.ts:33-42` |
| Alerts when GitHub jobs didn't run (runs on Inngest)                    | `apps/web/src/inngest/functions/maintenance/github-jobs-watchdog.ts:257`       |
| Run log for every job (`IngestionRun` table)                            | `apps/web/src/server/services/ingestion/runs.ts`, `schema.prisma:1150`         |

## 6. Things that trip people up

1. **There are two copies of the S3 sessions import.** The one that runs is `workers/streamhatchet-ingest.ts`. The copy at `apps/web/src/server/services/streamhatchet/daily-sessions.ts` (+ `inngest/functions/snapshots/streamhatchet-s3-daily-sessions.ts`) is **event-only, for manual use**, and is not scheduled.
2. **"Stream Hatchet" means two different feeds.** The **S3 files** are daily and historical (pipelines A–F). The **live API** is hourly and current (pipeline I, `adapters/streamhatchet.ts`, limited to one call every 10 s).
3. **Workers aren't deployed with the website.** They run on GitHub Actions or on a laptop against the prod DB. Changing `workers/` doesn't change the Vercel site.
4. **Every worker is dry-run unless you pass `--write`.**
5. **Never run `--force` on twitch days from 2026-09-16 to 10-01.** Stream Hatchet's copies of those files are truncated, and our DB holds the full data.

## 7. Key tables (`packages/database/prisma/schema.prisma`)

| Table                        | Line | Filled by                                 |
| ---------------------------- | ---- | ----------------------------------------- |
| `CreatorProfile`             | 193  | catalog (F), discovery                    |
| `IdentityLink`               | 303  | identity merge (social profiles, no flag) |
| `AudienceDemographics`       | 378  | E                                         |
| `PlatformAccount`            | 410  | catalog, C, D, L                          |
| `MetricSnapshot`             | 488  | L, C, I                                   |
| `Game`                       | 600  | K                                         |
| `GameTopChannel`             | 682  | H, I                                      |
| `GameViewerSnapshot`         | 748  | H                                         |
| `GamePlatformViewerSnapshot` | 770  | I, YT fallback                            |
| `StreamHatchetSourceObject`  | 800  | A                                         |
| `StreamSessionFact`          | 832  | A, B                                      |
| `ChannelDailyRollup`         | 924  | A                                         |
| `CreatorDailyRollup`         | 970  | A                                         |
| `GameDailyRollup`            | 1002 | A, B                                      |
| `ChannelGameDailyRollup`     | 1029 | A, B                                      |
| `IngestionRun`               | 1150 | every job                                 |

---

## 8. Exact endpoints we pull from

### AWS S3 (Stream Hatchet files)

**Auth:** read-only AWS credentials, region `us-east-1`. Locally that's the AWS profile `streamhatchet-readonly`. On GitHub it's the `SH_AWS_ACCESS_KEY_ID` / `SH_AWS_SECRET_ACCESS_KEY` secrets, which is why the workflows pass `--profile ""`.

| Feed                                           | Exact S3 location                                                                                                                       | How we read it                                                                                                                                                          | Code                                                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Daily sessions** (pipeline A)                | `s3://streamhatchet-aggregations/daily_sessions/summary/year=YYYY/month=MM/day=DD/{kick\|yt\|twitch}/basic.csv`                         | `aws s3api head-object` (is it there? ETag?) → `aws s3api select-object-content "SELECT count(*)"` (row count, without downloading) → `aws s3api get-object` (download) | bucket/prefix `workers/streamhatchet-ingest.ts:74-75`; key builder `workers/lib/streamhatchet-daily-sessions.ts:87`; head `:108`; row count `:132`; download `:168` |
| **Minutes per game** (pipeline B)              | `s3://streamhatchet-aggregations/daily_sessions_games/sessions_games/{kick\|yt\|twitch}/day/year=YYYY/month=MM/day=DD/YYYY-MM-DD.csv`   | same `head-object` + `get-object` helpers                                                                                                                               | bucket/prefix `workers/streamhatchet-game-minutes.ts:61-62`; key builder `:151`; head `:279`; download `:290`                                                       |
| **Social profiles export** (pipelines C, D, E) | `s3://streamhatchet-social-profiles-data/PostgreSQL-export/sh-snapshot-export-YYYY-MM-DD/partner_evaluator/public.<table>/**/*.parquet` | `aws s3 ls` finds the newest dated snapshot folder, then **DuckDB** reads the Parquet straight from S3                                                                  | bucket/prefix `workers/streamhatchet-ingest-social-profiles.ts:96-98`; newest snapshot `:233-236`; path builder `:255-256`; DuckDB S3 setup `:229`                  |

Tables read from the social profiles export:

| SH table                      | Used for                                   | Read at                                               |
| ----------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| `public.social_profiles`      | followers, social links, identity matching | `workers/streamhatchet-ingest-social-profiles.ts:263` |
| `public.contacts`             | identity merge + country/gender/age        | `:298`                                                |
| `public.contact_demographics` | audience demographics                      | `:1703`                                               |

### Stream Hatchet live API

- **Base URL:** `https://api.streamhatchet.com` (`apps/web/src/server/adapters/streamhatchet.ts:3`)
- **Auth:** a `?token=` query parameter taken from the env var `STREAMHATCHET_API_KEY` (`:149`, added at `:164`)
- **Rate limit:** one call every 10 s. We space calls 11 s apart (`apps/web/src/inngest/functions/snapshots/streamhatchet-game-snapshot.ts:39`). A 429 response is handled at `streamhatchet.ts:208`.
- **Platforms we request:** `twitch,ytg,kick` (`streamhatchet-game-snapshot.ts:30`). `ytg` is Stream Hatchet's code for YouTube.

| Endpoint                            | Parameters we send                                                                            | API wrapper                             | Called from (schedule)                             | Fills                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| `GET /discovery/games/last_30_days` | `platforms`, `excluded_genres=Non Gaming`, `limit=100`, `sort_by=hours_watched`, `order=desc` | `streamhatchet.ts:227` (path at `:250`) | `streamhatchet-game-snapshot.ts:790` (every 6 h)   | `PlatformGameMapping` (SH game ↔ our game), `Game` |
| `GET /live/games`                   | `platforms`, `limit=10000`                                                                    | `streamhatchet.ts:280` (path at `:290`) | `streamhatchet-game-snapshot.ts:298` (hourly, :25) | `GamePlatformViewerSnapshot`                       |
| `GET /live`                         | `game=<name>`, `platforms`, `limit=15`                                                        | `streamhatchet.ts:262` (path at `:270`) | `streamhatchet-game-snapshot.ts:262` (hourly, :45) | `GameTopChannel`, follower `MetricSnapshot`        |

### Platform APIs (for reference)

| API             | Base URL                                                                                                            | Endpoints we call                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Twitch Helix    | `https://api.twitch.tv/helix` (`adapters/twitch.ts:24`); app token from `https://id.twitch.tv/oauth2/token` (`:25`) | `/users` `:663`, `/streams` `:404`, `/games/top` `:829`, `/channels` `:745`, `/channels/followers` `:383`, `/clips` `:437`, `/videos` `:545`, `/search/channels` `:800` |
| YouTube Data v3 | `https://www.googleapis.com/youtube/v3` (`adapters/youtube.ts:13`); `key=YOUTUBE_API_KEY`                           | `channels` `:199`, `:276`, `:324`; `search` `:368`                                                                                                                      |
| Kick            | `https://api.kick.com` (`adapters/kick.ts:13`)                                                                      | `/public/v1/channels` `:261`, `/public/v1/livestreams` `:397`, `/public/v1/categories` `:363`, `/public/v2/categories` `:330`                                           |
| IGDB            | `https://api.igdb.com/v4/games` (`server/services/igdb.ts:29`)                                                      | game metadata (uses the same Twitch app credentials)                                                                                                                    |

(`adapters/` = `apps/web/src/server/adapters/`)
