// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { mount, type, key, click, button } from "@/test/dom";
import { EntityPicker } from "./EntityPicker";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("searches the correct scope, supports keyboard selection and cannot select stale results during debounce", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: {
        games: [
          {
            id: "g1",
            name: "Example game",
            slug: "example",
            coverImageUrl: null,
          },
        ],
      },
    }),
  });
  vi.stubGlobal("fetch", fetcher);
  const onChange = vi.fn();
  const ui = await mount(
    <EntityPicker
      kind="games"
      disabled={false}
      selected={[]}
      onChange={onChange}
    />,
  );
  const input = ui.container.querySelector("input")!;
  await type(input, "example");
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(fetcher).toHaveBeenCalledWith("/api/search?q=example&type=games");
  await key(input, "ArrowDown");
  expect(input.getAttribute("aria-activedescendant")).toBe(
    ui.container.querySelector('[role="option"]')!.id,
  );
  await key(input, "Enter");
  expect(onChange).toHaveBeenCalledWith([
    { id: "g1", label: "Example game", sublabel: "example", imageUrl: null },
  ]);
  onChange.mockClear();
  await type(input, "different");
  await key(input, "ArrowDown");
  await key(input, "Enter");
  expect(onChange).not.toHaveBeenCalled();
  expect(ui.container.querySelector('[role="option"]')).toBeNull();
  await key(input, "Escape");
  expect(input.getAttribute("aria-expanded")).toBe("false");
  await ui.unmount();
});

it("distinguishes failed creator searches from empty results and retries", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({
      ok: true,
      json: async () => ({ data: { creators: [] } }),
    });
  vi.stubGlobal("fetch", fetcher);
  const ui = await mount(
    <EntityPicker
      kind="channels"
      disabled={false}
      selected={[]}
      onChange={vi.fn()}
    />,
  );
  await type(ui.container.querySelector("input")!, "nova");
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain(
    "Search could not load",
  );
  await click(button(ui.container, "Try again"));
  expect(fetcher).toHaveBeenLastCalledWith("/api/search?q=nova&type=creators");
  expect(ui.container.textContent).toContain("No indexed channels");
  await ui.unmount();
});
