// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { button, click, mount, type } from "@/test/dom";
import { ReportRequestForm } from "./ReportRequestForm";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function setup() {
  const ui = await mount(
    <ReportRequestForm
      name="Test Buyer"
      email="buyer@example.test"
      company="Example Agency"
    />,
  );
  for (const label of ["Games", "Top 10", "Twitch", "Hours Watched"])
    await click(button(ui.container, label));
  return ui;
}

it("retains the instant report snapshot, Terms gate and checkout destination", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      mode: "mock",
      successUrl: "/reports/success?purchase_id=fixture",
    }),
  });
  vi.stubGlobal("fetch", fetcher);
  const ui = await setup();
  const buy = Array.from(ui.container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("$250"),
  )!;
  expect(buy.disabled).toBe(true);
  expect(ui.container.textContent).toContain("250");
  expect(ui.container.querySelector('a[href="/terms"]')).not.toBeNull();
  await click(ui.container.querySelector('input[type="checkbox"]')!);
  await click(buy);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, request] = fetcher.mock.calls[0]!;
  expect(url).toBe("/api/reports/checkout");
  expect(JSON.parse(request.body)).toEqual({
    name: "Test Buyer",
    email: "buyer@example.test",
    company: "Example Agency",
    formSnapshot: {
      include: "games",
      topCount: 10,
      timePeriod: "30d",
      platforms: ["twitch"],
      metrics: ["hoursWatched"],
      entityIds: [],
      entityLabels: [],
    },
  });
  expect(push).toHaveBeenCalledWith("/reports/success?purchase_id=fixture");
  await ui.unmount();
});

it("retains custom ranges in quote requests and recovers from submission failure", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({
      ok: true,
      json: async () => ({ data: { submitted: true } }),
    });
  vi.stubGlobal("fetch", fetcher);
  const ui = await setup();
  await click(button(ui.container, "Custom range"));
  await type(
    ui.container.querySelector(
      'input[aria-label="Custom reporting date range"]',
    )!,
    "January through March 2025",
  );
  await click(ui.container.querySelector('input[type="checkbox"]')!);
  await click(button(ui.container, "Request Quote"));
  expect(ui.container.querySelector('[role="alert"]')).not.toBeNull();
  await click(button(ui.container, "Request Quote"));
  expect(fetcher.mock.calls[1]![0]).toBe("/api/reports/lead");
  expect(JSON.parse(fetcher.mock.calls[1]![1].body).details).toMatchObject({
    customRange: "January through March 2025",
    formSnapshot: { timePeriod: "custom", metrics: ["hoursWatched"] },
  });
  expect(push).toHaveBeenCalledWith("/reports/success?mode=quote");
  await ui.unmount();
});
