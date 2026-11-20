import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DISPATCH_SLOTS,
  GITHUB_REPO,
  dispatchSlot,
  isDispatchSlot,
} from "./github-dispatch";

const APP_ROOT = path.resolve(__dirname, "../../..");
const WORKFLOWS = path.resolve(APP_ROOT, "../../.github/workflows");

describe("dispatch slots", () => {
  it("vercel.json has exactly one cron per slot, same schedule", () => {
    const vercel = JSON.parse(
      readFileSync(path.join(APP_ROOT, "vercel.json"), "utf8"),
    ) as { crons: { path: string; schedule: string }[] };
    const fromVercel = Object.fromEntries(
      vercel.crons.map((cron) => [cron.path, cron.schedule]),
    );
    const fromSlots = Object.fromEntries(
      Object.entries(DISPATCH_SLOTS).map(([name, slot]) => [
        `/api/cron/dispatch/${name}`,
        slot.cron,
      ]),
    );
    expect(fromVercel).toEqual(fromSlots);
    expect(vercel.crons).toHaveLength(Object.keys(DISPATCH_SLOTS).length);
  });

  it("every slot targets a workflow that takes its inputs by dispatch", () => {
    for (const slot of Object.values(DISPATCH_SLOTS)) {
      const text = readFileSync(path.join(WORKFLOWS, slot.workflow), "utf8");
      expect(text).toContain("workflow_dispatch:");
      for (const input of Object.keys(slot.inputs)) {
        expect(text).toMatch(new RegExp(`^      ${input}:`, "m"));
      }
    }
  });

  // GitHub's scheduler starts this repo's runs hours late; a `schedule` here
  // would run every job a second time, late.
  it("dispatched workflows have no schedule of their own", () => {
    for (const workflow of new Set(
      Object.values(DISPATCH_SLOTS).map((slot) => slot.workflow),
    )) {
      const code = readFileSync(path.join(WORKFLOWS, workflow), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n");
      expect(code).not.toMatch(/^\s*schedule:/m);
    }
  });

  it("knows its slot names", () => {
    expect(isDispatchSlot("game")).toBe(true);
    expect(isDispatchSlot("toString")).toBe(false);
    expect(isDispatchSlot("nope")).toBe(false);
  });
});

describe("dispatchSlot", () => {
  it("posts the slot's inputs to its workflow on main", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const result = await dispatchSlot(
      "tier1",
      "tok",
      fetchMock as typeof fetch,
    );
    expect(result).toEqual({
      ok: true,
      slot: "tier1",
      workflow: "creator-snapshots.yml",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/creator-snapshots.yml/dispatches`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      ref: "main",
      inputs: { tier: "tier1" },
    });
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer tok",
    );
  });

  it("reports a refusal instead of throwing", async () => {
    const fetchMock = vi.fn(
      async () => new Response("Bad credentials", { status: 401 }),
    );
    const result = await dispatchSlot("game", "bad", fetchMock as typeof fetch);
    expect(result).toEqual({
      ok: false,
      slot: "game",
      status: 401,
      error: "Bad credentials",
    });
  });

  it("reports a network error instead of throwing", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await dispatchSlot("game", "tok", fetchMock as typeof fetch);
    expect(result).toMatchObject({ ok: false, status: 0, error: "boom" });
  });
});
