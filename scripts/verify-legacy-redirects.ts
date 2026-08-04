/**
 * Replay legacy twitchmetrics.net URLs against this app and report how each
 * resolves. Used pre-cutover against a dev server and post-cutover against
 * prod to quantify redirect coverage.
 *
 * Usage:
 *   npx tsx scripts/verify-legacy-redirects.ts [--base http://localhost:3000] \
 *     [--file scripts/legacy-url-sample.txt] [--limit 500] [--auth admin:pass]
 */

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const BASE = (argValue("--base") ?? "http://localhost:3000").replace(/\/$/, "");
const FILE = argValue("--file") ?? "scripts/legacy-url-sample.txt";
const LIMIT = Number(argValue("--limit") ?? "0");
const AUTH = argValue("--auth");
const CONCURRENCY = 20;
const MAX_HOPS = 5;

type Outcome =
  | "redirect->200"
  | "redirect->404"
  | "redirect->other"
  | "404"
  | "410"
  | "200-direct"
  | "error"
  | "other";

interface Result {
  path: string;
  outcome: Outcome;
  chain: string[];
  finalStatus: number | null;
}

const headers: Record<string, string> = AUTH
  ? { Authorization: `Basic ${Buffer.from(AUTH).toString("base64")}` }
  : {};

async function probe(path: string): Promise<Result> {
  const chain: string[] = [];
  let url = `${BASE}${path}`;
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const res = await fetch(url, { redirect: "manual", headers });
      chain.push(`${res.status} ${new URL(url).pathname}`);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc)
          return { path, outcome: "error", chain, finalStatus: res.status };
        url = new URL(loc, url).toString();
        continue;
      }
      const redirected = chain.length > 1;
      const outcome: Outcome =
        res.status === 200
          ? redirected
            ? "redirect->200"
            : "200-direct"
          : res.status === 404
            ? redirected
              ? "redirect->404"
              : "404"
            : res.status === 410
              ? "410"
              : redirected
                ? "redirect->other"
                : "other";
      return { path, outcome, chain, finalStatus: res.status };
    }
    return { path, outcome: "error", chain, finalStatus: null };
  } catch {
    return { path, outcome: "error", chain, finalStatus: null };
  }
}

async function main() {
  const fs = await import("node:fs");
  let paths = fs
    .readFileSync(FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("/"));
  if (LIMIT > 0) {
    // Even sampling across the sorted file keeps every pattern represented.
    const step = Math.max(1, Math.floor(paths.length / LIMIT));
    paths = paths.filter((_, i) => i % step === 0).slice(0, LIMIT);
  }

  console.log(`Probing ${paths.length} legacy URLs against ${BASE}\n`);

  const results: Result[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < paths.length) {
      const path = paths[cursor++];
      if (!path) continue;
      results.push(await probe(path));
      if (results.length % 200 === 0)
        process.stdout.write(`  ...${results.length}/${paths.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const byOutcome = new Map<Outcome, Result[]>();
  for (const r of results) {
    const bucket = byOutcome.get(r.outcome) ?? [];
    bucket.push(r);
    byOutcome.set(r.outcome, bucket);
  }

  console.log("\n=== Outcome summary ===");
  for (const [outcome, bucket] of [...byOutcome.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    const pct = ((bucket.length / results.length) * 100).toFixed(1);
    console.log(
      `${outcome.padEnd(16)} ${String(bucket.length).padStart(6)}  (${pct}%)`,
    );
  }

  const resolved =
    (byOutcome.get("redirect->200")?.length ?? 0) +
    (byOutcome.get("200-direct")?.length ?? 0);
  console.log(
    `\nResolved to content: ${resolved}/${results.length} (${((resolved / results.length) * 100).toFixed(1)}%)`,
  );

  for (const bad of [
    "redirect->404",
    "redirect->other",
    "error",
    "other",
  ] as const) {
    const bucket = byOutcome.get(bad);
    if (bucket?.length) {
      console.log(`\n--- Sample ${bad} (${bucket.length} total) ---`);
      for (const r of bucket.slice(0, 8))
        console.log(`  ${r.path}\n    ${r.chain.join(" -> ")}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
