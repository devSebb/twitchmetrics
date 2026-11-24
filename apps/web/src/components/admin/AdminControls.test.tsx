// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { button, click, key, mount } from "@/test/dom";
import { SystemHealth } from "./SystemHealth";
import { AuditLogViewer } from "./AuditLogViewer";
import { ClaimReviewQueue } from "./ClaimReviewQueue";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  retry: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ admin: { getClaimQueue: { invalidate: vi.fn() } } }),
    admin: {
      getSystemHealth: { useQuery: mocks.query },
      getAuditLog: { useQuery: mocks.query },
      getClaimQueue: { useQuery: mocks.query },
    },
    claim: {
      approve: {
        useMutation: () => ({ mutate: mocks.mutate, isPending: false }),
      },
      reject: {
        useMutation: () => ({ mutate: mocks.mutate, isPending: false }),
      },
    },
  },
}));
afterEach(() => vi.restoreAllMocks());

it("shows a retryable health error without presenting missing data as measured health", async () => {
  mocks.query.mockReturnValue({
    isLoading: false,
    isError: true,
    refetch: mocks.retry,
  });
  const ui = await mount(<SystemHealth />);
  expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain(
    "system health",
  );
  expect(ui.container.textContent).not.toContain("Degraded");
  await click(button(ui.container, "Try again"));
  expect(mocks.retry).toHaveBeenCalledOnce();
  await ui.unmount();
});

it("expands audit details through a labelled control while preserving filters", async () => {
  mocks.query.mockReturnValue({
    isLoading: false,
    data: {
      total: 1,
      items: [
        {
          id: "audit",
          createdAt: new Date("2026-11-23"),
          user: { name: "Example", email: "admin@example.test" },
          action: "creator.update_tier",
          targetType: "creator",
          targetId: "example",
          metadata: { newTier: "tier1" },
        },
      ],
    },
  });
  const ui = await mount(<AuditLogViewer />);
  const details = button(ui.container, "View details");
  expect(details.getAttribute("aria-expanded")).toBe("false");
  await click(details);
  expect(details.getAttribute("aria-expanded")).toBe("true");
  expect(
    ui.container.querySelector(`#${details.getAttribute("aria-controls")}`)
      ?.textContent,
  ).toContain('"newTier": "tier1"');
  expect(mocks.query).toHaveBeenCalledWith({
    action: undefined,
    targetType: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    page: 1,
    limit: 50,
  });
  await ui.unmount();
});

it("opens a claim review without submitting, requires rejection notes and restores focus on Escape", async () => {
  mocks.query.mockReturnValue({
    isLoading: false,
    data: {
      total: 1,
      items: [
        {
          id: "claim",
          createdAt: new Date("2026-11-23"),
          status: "pending",
          method: "manual",
          evidenceUrls: [],
          reviewNotes: null,
          creatorProfile: {
            id: "creator",
            displayName: "Example creator",
            slug: "example",
            avatarUrl: null,
            totalFollowers: BigInt(100),
            primaryPlatform: "twitch",
          },
          user: { id: "user", email: "creator@example.test", name: "Example" },
        },
      ],
    },
  });
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
    length: 1,
  } as DOMRectList);
  const ui = await mount(<ClaimReviewQueue />);
  const trigger = button(ui.container, "Example creator");
  trigger.focus();
  await click(trigger);
  expect(
    ui.container.querySelector('[role="dialog"]')?.getAttribute("aria-modal"),
  ).toBe("true");
  expect(button(ui.container, "Reject").disabled).toBe(true);
  expect(mocks.mutate).not.toHaveBeenCalled();
  await key(document.activeElement!, "Escape");
  expect(ui.container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await ui.unmount();
});
