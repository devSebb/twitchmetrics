// @vitest-environment jsdom
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { mount, click, key, button } from "@/test/dom";
import { useDialogFocus } from "./useDialogFocus";

function Dialog() {
  const [open, setOpen] = useState(false);
  const ref = useDialogFocus(open, () => setOpen(false));
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <div ref={ref} role="dialog" tabIndex={-1}>
          <button onClick={() => setOpen(false)}>Close</button>
          <input aria-label="Example" />
          <button>Last</button>
        </div>
      )}
    </>
  );
}

it("contains keyboard focus, closes with Escape and restores the invoking control and scroll", async () => {
  const rects = vi
    .spyOn(HTMLElement.prototype, "getClientRects")
    .mockReturnValue({ length: 1 } as DOMRectList);
  document.body.style.overflow = "auto";
  const ui = await mount(<Dialog />);
  const trigger = button(ui.container, "Open");
  trigger.focus();
  await click(trigger);
  expect(document.activeElement).toBe(button(ui.container, "Close"));
  expect(document.body.style.overflow).toBe("hidden");
  await key(document.activeElement!, "Tab", true);
  expect(document.activeElement).toBe(button(ui.container, "Last"));
  await key(document.activeElement!, "Tab");
  expect(document.activeElement).toBe(button(ui.container, "Close"));
  await key(document.activeElement!, "Escape");
  expect(ui.container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe("auto");
  await ui.unmount();
  rects.mockRestore();
});
