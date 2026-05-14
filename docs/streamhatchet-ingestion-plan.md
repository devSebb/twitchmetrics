# StreamHatchet Ingestion Plan

## Role In The Architecture

StreamHatchet S3 data is a historical session-fact source. It complements, but does not replace, the existing API snapshot pipelines.

- Twitch API snapshots remain the source for live/current Twitch state, game snapshots, clips, profile refreshes, OAuth features, and real-time-ish widgets.
- StreamHatchet daily session summaries become the source for completed stream sessions, airtime, minutes watched, average viewers, peak viewers, ranks, and cross-platform historical reports.
- Reports and widgets should prefer session facts for completed-history metrics and API snapshots for live/current metrics.

## Current S3 Dataset

Known bucket and prefix:

```text
s3://streamhatchet-aggregations/daily_sessions/summary/
```

Observed partition shape:

```text
daily_sessions/summary/year=YYYY/month=MM/day=DD/{platform}/basic.csv
```

Observed platforms:

```text
kick
twitch
yt
ytg
facebook
afreeca in older partitions
```

## Ingestion Phases

1. KICK first.
   - KICK has no mature app API ingestion today.
   - The StreamHatchet file gives immediate, truthful session metrics.
   - Default behavior links only to existing KICK `PlatformAccount` rows by platform user ID or username.
   - It does not infer KICK ownership from Twitch username similarity.
   - After import, run the identity linker to create high-confidence KICK `PlatformAccount` rows for existing creators. The first supported rule is exact KICK username equals Twitch username, case-insensitive. Primary platform remains unchanged.

2. Twitch second.
   - Keep the Twitch API pipeline unchanged.
   - Add StreamHatchet session facts for completed-session history and report quality.
   - Use API snapshots for live/current data and StreamHatchet for historical session facts.

3. YouTube / YouTube Gaming.
   - Normalize `yt` and `ytg` as external source platforms.
   - Map into existing `youtube` platform accounts only when identity is deterministic.
   - Keep YouTube API/OAuth analytics separate.

4. Other platforms.
   - Ingest only after confirming platform identity rules and product need.

## Safety Rules

- Default worker mode is dry-run.
- Writes require `--write`.
- Existing completed source objects with the same ETag are skipped unless `--force` is passed.
- Every imported session points back to a `StreamHatchetSourceObject`.
- No new `CreatorProfile` rows are created by default.
- No fuzzy cross-platform matching is performed by default.
- Directory platform filters mean "creator has this platform account", not "this is the creator's primary platform".

## Deferred Admin Dashboard Work

Do not prioritize this before creator-facing channel data. Later, add a compact admin surface for:

- latest StreamHatchet source objects by platform/date
- rows imported, skipped, failed, and source ETag
- top imported channels/games for a selected date
- ingestion run status and last successful daily partition

## Commands

Dry-run one KICK day:

```bash
pnpm worker:streamhatchet -- --platform kick --date 2026-05-13
```

Import one KICK day:

```bash
pnpm worker:streamhatchet -- --platform kick --date 2026-05-13 --write
```

Dry-run KICK identity linking:

```bash
pnpm worker:streamhatchet-link -- --platform kick
```

Create exact-match KICK account links and backfill imported rows:

```bash
pnpm worker:streamhatchet-link -- --platform kick --write
```

Backfill recent KICK days:

```bash
pnpm worker:streamhatchet -- --platform kick --days 30 --write
```

Reprocess a known object:

```bash
pnpm worker:streamhatchet -- --platform kick --date 2026-05-13 --write --force
```

Limit rows for parser validation:

```bash
pnpm worker:streamhatchet -- --platform kick --date 2026-05-13 --row-limit 100
```
