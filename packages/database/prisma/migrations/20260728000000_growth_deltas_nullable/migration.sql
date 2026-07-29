-- Growth delta/pct columns become nullable so "no comparison snapshot within
-- tolerance" (unknown) is distinct from a measured 0 (genuinely flat).
-- Existing rows keep their values; rows whose 0 actually meant "unknown" are
-- corrected on the next rollup recompute (worker or post-snapshot hook).
ALTER TABLE "CreatorGrowthRollup"
  ALTER COLUMN "delta1d" DROP NOT NULL,
  ALTER COLUMN "delta1d" DROP DEFAULT,
  ALTER COLUMN "delta7d" DROP NOT NULL,
  ALTER COLUMN "delta7d" DROP DEFAULT,
  ALTER COLUMN "delta30d" DROP NOT NULL,
  ALTER COLUMN "delta30d" DROP DEFAULT,
  ALTER COLUMN "pct1d" DROP NOT NULL,
  ALTER COLUMN "pct1d" DROP DEFAULT,
  ALTER COLUMN "pct7d" DROP NOT NULL,
  ALTER COLUMN "pct7d" DROP DEFAULT,
  ALTER COLUMN "pct30d" DROP NOT NULL,
  ALTER COLUMN "pct30d" DROP DEFAULT;
