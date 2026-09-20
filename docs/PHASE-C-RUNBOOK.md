# Phase C runbook — rollup overhaul (C25, C26, C27, C30)

Ordered steps to get the rollup overhaul onto prod. Every step says how to verify it and
what breaks if it runs out of order. Written 2026-09-20, after Phase 1 shipped.

**The one hard rule:** the import's `ON CONFLICT` needs
`StreamSessionFact_stream_identity_key`, and that index cannot be built while duplicates
exist. So: **dedupe → index → deploy**. Deploying the code first makes every import fail.

Code lives on branch `rollups-c25-c27` (`54df667` write path, `9a2edb0` read path) and is
**not deployable** until step 4.

| Step | What                                 | Where        | Rough time                  |
| ---- | ------------------------------------ | ------------ | --------------------------- |
| 1    | Dedupe dry run (yt)                  | Actions      | 10 min                      |
| 2    | Dedupe write: yt → twitch → kick     | Actions      | 2–6 h                       |
| 3    | Index swap + migrations              | psql, laptop | 30–60 min                   |
| 4    | Merge, push, deploy, re-sync Inngest | laptop       | 15 min                      |
| 5    | Rebuild rollups per platform         | Actions      | hours (yt is the long pole) |
| 6    | Rebuild creator rollups              | Actions      | 1–2 h                       |
| 7    | Verify                               | psql         | 10 min                      |

Until the branch merges (step 4), dispatch with `--ref rollups-c25-c27`.

---

## Before starting

- Consider raising Neon's autoscale ceiling to 8 CU for steps 2, 5 and 6, and putting it
  back to 2 CU afterwards. The reslug run showed index churn, not CPU, is usually the
  limit — but the rollup rebuild is genuinely compute-heavy.
- A GitHub runner stops at 350 minutes. Every worker here is resumable: the dedupe by
  re-running (it only sees groups that still have duplicates), the rebuilds by moving
  `from` to the last date in the log.

## 1. Dedupe dry run

```
gh workflow run "Data repair (manual)" --ref rollups-c25-c27 \
  -f worker=dedupe-stream-sessions -f platform=yt -f write=false -f limit=200
```

Expect the shape measured on 2026-09-16: ~5,044 rows collapsing to 200 groups, airtime
21.4M → 9.1M minutes (−57.5 %). A materially different ratio means the export changed —
stop and re-measure before writing.

## 2. Dedupe, for real

One platform at a time, worst first. Each merges its groups and deletes the extra rows.

```
gh workflow run "Data repair (manual)" --ref rollups-c25-c27 -f worker=dedupe-stream-sessions -f platform=yt     -f write=true -f limit=0
gh workflow run "Data repair (manual)" --ref rollups-c25-c27 -f worker=dedupe-stream-sessions -f platform=twitch -f write=true -f limit=0
gh workflow run "Data repair (manual)" --ref rollups-c25-c27 -f worker=dedupe-stream-sessions -f platform=kick   -f write=true -f limit=0
```

Verify (expect 0 rows):

```sql
select platform, count(*) from (
  select platform, "platformUserId", coalesce("platformVideoId",'') v, count(*) c
  from "StreamSessionFact"
  where "platformVideoId" is not null
  group by 1,2,3 having count(*) > 1) t
group by 1;
```

## 3. Index swap and migrations

**Timing matters.** The daily S3 import runs at **08:10 UTC** and, with the old code still
deployed, can insert fresh duplicates. Do this right after a daily import finishes, so the
window between dedupe and index is as small as possible. If the index build fails on
duplicates, re-run step 2 for that platform and try again.

```bash
psql "$DIRECT_URL" -c 'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "StreamSessionFact_stream_identity_key"
  ON "StreamSessionFact" (source, platform, "platformUserId",
    (COALESCE("platformVideoId", '"'"''"'"')),
    (COALESCE(CASE WHEN "platformVideoId" IS NULL THEN "streamBeginsAt" END, TIMESTAMP '"'"'1970-01-01'"'"')));'

psql "$DIRECT_URL" -c 'DROP INDEX IF EXISTS "StreamSessionFact_source_platform_user_video_window_key";'
```

`CONCURRENTLY` keeps the table writable while it builds; it cannot run inside a
transaction, so it goes through psql rather than the migration runner. Then record both
migrations (their SQL is `IF NOT EXISTS`, so this is a no-op for the index and creates
`CreatorDailyRollup`):

```bash
pnpm --filter @twitchmetrics/database exec prisma migrate deploy
```

Verify:

```sql
select indexname from pg_indexes where tablename = 'StreamSessionFact';
-- expect StreamSessionFact_stream_identity_key, and NOT ..._source_platform_user_video_window_key
select to_regclass('"CreatorDailyRollup"');  -- not null
```

## 4. Merge, deploy

Until now prod runs the old import, which is fine: with the new index in place its
`createMany(skipDuplicates)` simply skips re-sightings instead of merging them.

```bash
git switch main && git merge rollups-c25-c27
pnpm typecheck && pnpm test
git push          # user pushes
```

Deploy from a clean copy — `vercel deploy` uploads the working tree, not the commit:

```bash
git worktree add ../twitchmetrics-deploy main
cp -R .vercel ../twitchmetrics-deploy/.vercel
cd ../twitchmetrics-deploy && vercel deploy --prod --yes --scope dev-5641s-projects
cd - && git worktree remove ../twitchmetrics-deploy
curl -X PUT https://twitchmetrics.vercel.app/api/inngest
```

After this the import merges re-sightings (`updated` appears in the run summary) and the
cron rebuilds D-3…D rollups on every run.

## 5. Rebuild the per-platform rollups

Smallest first. These rewrite `ChannelDailyRollup`, `ChannelGameDailyRollup` (now one row
per category, C25) and `GameDailyRollup`, with C26's per-day attribution.

```
gh workflow run "Data repair (manual)" -f worker=recompute-rollups -f platform=kick   -f from=<today-30> -f to=<today> -f write=true
gh workflow run "Data repair (manual)" -f worker=recompute-rollups -f platform=twitch -f from=<today-30> -f to=<today> -f write=true
gh workflow run "Data repair (manual)" -f worker=recompute-rollups -f platform=yt     -f from=2026-04-10 -f to=<today> -f write=true
```

YouTube spans five months and will likely need more than one run: take the last
`Rollups rebuilt` date from the log and re-run with `from` set to the next day.

## 6. Rebuild the creator rollups

Per date, across every platform, so it runs after step 5.

```
gh workflow run "Data repair (manual)" -f worker=creator-rollups-only -f platform=yt -f from=2026-04-10 -f to=<today> -f write=true
```

(`platform` only feeds date parsing here; the rows it writes cover all platforms.)

## 7. Verify

```sql
-- C26: no day claims more than 24 h
select platform, count(*) from "ChannelDailyRollup"
where date >= current_date - 7 and "airtimeMinutes" > 1440 group by 1;   -- expect 0

-- C25: every category a channel played is stored (Caedrel: 7 and 7)
select 'sessions' src, count(distinct g) from (
  select unnest("allGameNames") g from "StreamSessionFact"
  where "platformUserId"='92038375' and platform='twitch'
    and "partitionDate" >= current_date - 30) t
union all
select 'rollup', count(distinct "gameName") from "ChannelGameDailyRollup"
where "platformUserId"='92038375' and platform='twitch' and date >= current_date - 30;

-- C27: merged airtime never exceeds the day, and is <= the per-platform sum
select p.slug, c.date, c."uniqueAirtimeMinutes", c."streamBlocks",
       round(c."minutesWatched"::numeric / nullif(c."uniqueAirtimeMinutes",0)) avg_v
from "CreatorDailyRollup" c join "CreatorProfile" p on p.id = c."creatorProfileId"
where p.slug in ('ishowspeed','lck-carry') and c.date >= current_date - 7
order by 1,2;
```

Then `gh workflow run ... -f worker=...` is done; run the stranding check once more:

```bash
npx tsx --env-file=apps/web/.env.local workers/check-merge-stranding.ts   # expect exit 0
```

Finally, spot-check the QA sheet's channels on the live site: airtime should drop sharply
for YouTube-heavy creators, categories should be complete, and a simulcast day should show
one airtime figure with a combined average.

## If something goes wrong

- **Index build fails on duplicates** — re-run step 2 for that platform; nothing else is
  affected.
- **Imports fail after deploy with a missing-index error** — the index was never created;
  do step 3. The old rows are untouched.
- **Rollups look wrong after a rebuild** — the rebuild is idempotent and derives everything
  from `StreamSessionFact`, so fix the builder and re-run for the affected dates.
- **Roll back the app** — promote the previous Vercel deploy. The new index stays; the old
  code just ignores it.
