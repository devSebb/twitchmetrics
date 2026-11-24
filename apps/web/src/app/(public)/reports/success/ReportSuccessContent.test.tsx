// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { button, click, mount } from "@/test/dom";
import { ReportSuccessContent } from "./ReportSuccessContent";

const state = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => state.params }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("does not verify or download for quotes or missing payment references", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  state.params = new URLSearchParams("mode=quote");
  const quote = await mount(<ReportSuccessContent />);
  expect(quote.container.querySelector("h1")?.textContent).toBe(
    "Request received",
  );
  await quote.unmount();
  state.params = new URLSearchParams();
  const missing = await mount(<ReportSuccessContent />);
  expect(missing.container.querySelector('[role="alert"]')?.textContent).toBe(
    "No payment reference found.",
  );
  expect(fetcher).not.toHaveBeenCalled();
  await missing.unmount();
});

it("retries verification and download failures, then allows another download", async () => {
  state.params = new URLSearchParams("session_id=fixture-session");
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      json: async () => ({
        purchase: { id: "fixture-purchase", templateName: "Example Report" },
      }),
    })
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["example"]),
      headers: new Headers({
        "Content-Disposition": 'attachment; filename="example.csv"',
      }),
    });
  vi.stubGlobal("fetch", fetcher);
  const create = vi.fn().mockReturnValue("blob:example");
  const revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: create,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revoke,
  });
  const anchor = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  const ui = await mount(<ReportSuccessContent />);
  await click(button(ui.container, "Try verification again"));
  expect(fetcher).toHaveBeenNthCalledWith(
    2,
    "/api/reports/verify?session_id=fixture-session",
  );
  const download = () =>
    Array.from(ui.container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Download Report (CSV)"),
    )!;
  await click(download());
  expect(ui.container.textContent).toContain("Download failed");
  await click(download());
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/reports/download?purchase_id=fixture-purchase",
  );
  expect(anchor).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith("blob:example");
  expect(ui.container.textContent).toContain("Download started");
  const again = Array.from(ui.container.querySelectorAll("button")).find((b) =>
    /download again/i.test(b.textContent ?? ""),
  )!;
  await click(again);
  await click(download());
  expect(anchor).toHaveBeenCalledTimes(2);
  await ui.unmount();
});
