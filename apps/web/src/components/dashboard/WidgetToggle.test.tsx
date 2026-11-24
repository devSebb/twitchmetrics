// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { click, mount } from "@/test/dom";
import { WidgetToggle } from "./WidgetToggle";
import type { WidgetId } from "@/lib/constants/widgets";

type Config = { widgetConfig: WidgetId[] };
type Visibility = { publicDemographicsEnabled: boolean };
const mocks = vi.hoisted(() => ({
  config: { mutate: vi.fn(), isPending: false },
  visibility: { mutate: vi.fn(), isPending: false },
  configCallbacks: {} as {
    onSuccess: (data: unknown, variables: Config) => void;
    onError: () => void;
  },
  visibilityCallbacks: {} as {
    onSuccess: (data: Visibility) => void;
    onError: () => void;
  },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    creator: {
      updateWidgetConfig: {
        useMutation: (callbacks: typeof mocks.configCallbacks) => {
          mocks.configCallbacks = callbacks;
          return mocks.config;
        },
      },
      updatePublicDataVisibility: {
        useMutation: (callbacks: typeof mocks.visibilityCallbacks) => {
          mocks.visibilityCallbacks = callbacks;
          return mocks.visibility;
        },
      },
    },
  },
}));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function Preview() {
  const [config, setConfig] = useState<WidgetId[]>(["follower_growth"]);
  return (
    <WidgetToggle
      open
      onClose={() => {}}
      enabledWidgets={config}
      onConfigChange={setConfig}
      profileSlug="fixture"
      publicDemographicsEnabled={false}
    />
  );
}

it("rolls failed saves back to the last successful widget configuration and keeps public visibility separate", async () => {
  vi.useFakeTimers();
  const ui = await mount(<Preview />);
  const switches = () =>
    Array.from(
      ui.container.querySelectorAll<HTMLButtonElement>('[role="switch"]'),
    );
  const growth = () =>
    switches().find((item) => item.textContent?.includes("Follower Growth"))!;
  const privacy = () =>
    switches().find((item) =>
      item.textContent?.includes("Show audience data publicly"),
    )!;
  expect(growth().getAttribute("aria-checked")).toBe("true");
  await click(growth());
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(mocks.config.mutate).toHaveBeenLastCalledWith({ widgetConfig: [] });
  await act(async () =>
    mocks.configCallbacks.onSuccess({}, { widgetConfig: [] }),
  );
  await click(growth());
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(mocks.config.mutate).toHaveBeenLastCalledWith({
    widgetConfig: ["follower_growth"],
  });
  await act(async () => mocks.configCallbacks.onError());
  expect(growth().getAttribute("aria-checked")).toBe("false");
  expect(ui.container.textContent).toContain("Failed to save");
  await click(privacy());
  expect(mocks.visibility.mutate).toHaveBeenCalledWith({
    publicDemographicsEnabled: true,
  });
  await act(async () => mocks.visibilityCallbacks.onError());
  expect(privacy().getAttribute("aria-checked")).toBe("false");
  expect(growth().getAttribute("aria-checked")).toBe("false");
  await ui.unmount();
});
