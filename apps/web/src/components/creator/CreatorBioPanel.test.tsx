// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { button, click, key, mount } from "@/test/dom";
import { CreatorBioPanel } from "./CreatorBioPanel";

it("opens from the button, closes with Escape or the backdrop, and hands focus back", async () => {
  const rects = vi
    .spyOn(HTMLElement.prototype, "getClientRects")
    .mockReturnValue({ length: 1 } as DOMRectList);
  const ui = await mount(
    <CreatorBioPanel name="Sample" bio={"First line.\nSecond line."} />,
  );
  const panel = ui.container.querySelector("[data-bio-panel]")!;
  const trigger = button(ui.container, "Read full bio");

  // The full text is in the document before anyone opens the panel.
  expect(panel.className).toBe("hidden");
  expect(panel.textContent).toContain("Second line.");

  trigger.focus();
  await click(trigger);
  expect(panel.className).not.toBe("hidden");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Close bio");
  expect(document.body.style.overflow).toBe("hidden");

  await key(document.activeElement!, "Escape");
  expect(panel.className).toBe("hidden");
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).not.toBe("hidden");

  await click(trigger);
  await click(ui.container.querySelector("[data-bio-backdrop]")!);
  expect(panel.className).toBe("hidden");

  await ui.unmount();
  rects.mockRestore();
});
