import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TWITCH_RESERVE } from "./twitch-rate";

/**
 * Every GitHub workflow that runs Twitch code sets TWITCH_RATE_PRIORITY
 * (PLAN-infra R10). Without it a worker's calls count as page requests:
 * no pacing, and a 429 fails at once instead of waiting for the reset.
 */
const WORKFLOWS = path.resolve(__dirname, "../../../../../.github/workflows");

describe("GitHub workflows calling Twitch", () => {
  const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));

  it("finds the workflows", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const text = readFileSync(path.join(WORKFLOWS, file), "utf8");
    // Comment lines don't run anything.
    const code = text
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    if (!/secrets\.TWITCH_CLIENT_ID/.test(code)) continue;

    it(`${file} sets a valid TWITCH_RATE_PRIORITY`, () => {
      const values = [...code.matchAll(/TWITCH_RATE_PRIORITY:\s*"?(\w+)"?/g)];
      expect(values.length).toBeGreaterThan(0);
      for (const [, value] of values) {
        expect(Object.keys(TWITCH_RESERVE)).toContain(value);
      }
    });
  }
});
