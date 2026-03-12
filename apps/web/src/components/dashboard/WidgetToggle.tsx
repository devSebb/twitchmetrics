"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WIDGET_ORDER,
  WIDGET_REGISTRY,
  getDefaultWidgets,
  type WidgetId,
} from "@/lib/constants/widgets";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui";

type WidgetToggleProps = {
  open: boolean;
  onClose: () => void;
  enabledWidgets: WidgetId[];
  onConfigChange: (config: WidgetId[]) => void;
  profileSlug: string;
};

export function WidgetToggle({
  open,
  onClose,
  enabledWidgets,
  onConfigChange,
  profileSlug,
}: WidgetToggleProps) {
  const [localConfig, setLocalConfig] = useState<Set<WidgetId>>(
    () => new Set(enabledWidgets),
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevConfigRef = useRef<WidgetId[]>(enabledWidgets);

  // Sync with parent when enabledWidgets changes externally
  useEffect(() => {
    setLocalConfig(new Set(enabledWidgets));
    prevConfigRef.current = enabledWidgets;
  }, [enabledWidgets]);

  const mutation = trpc.creator.updateWidgetConfig.useMutation({
    onSuccess: () => {
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    },
    onError: () => {
      // Rollback on failure
      setStatus("error");
      const rollback = prevConfigRef.current;
      setLocalConfig(new Set(rollback));
      onConfigChange(rollback);
      setTimeout(() => setStatus("idle"), 2000);
    },
  });

  const persistConfig = useCallback(
    (config: WidgetId[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setStatus("saving");
        prevConfigRef.current = config;
        mutation.mutate({ widgetConfig: config });
      }, 400);
    },
    [mutation],
  );

  const handleToggle = useCallback(
    (widgetId: WidgetId) => {
      setLocalConfig((prev) => {
        const next = new Set(prev);
        if (next.has(widgetId)) {
          next.delete(widgetId);
        } else {
          next.add(widgetId);
        }
        const arr = WIDGET_ORDER.filter((id) => next.has(id));
        onConfigChange(arr);
        persistConfig(arr);
        return next;
      });
    },
    [onConfigChange, persistConfig],
  );

  const handleResetDefaults = useCallback(() => {
    const defaults = getDefaultWidgets();
    setLocalConfig(new Set(defaults));
    onConfigChange(defaults);
    persistConfig(defaults);
  }, [onConfigChange, persistConfig]);

  // ESC key to close
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-[#3F4147] bg-[#1E1F22] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3F4147] px-5 py-4">
          <h2 className="text-base font-semibold text-[#F2F3F5]">
            Customize Widgets
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#949BA4] transition-colors hover:bg-[#313338] hover:text-[#DBDEE1]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Widget list */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-1">
            {WIDGET_ORDER.map((widgetId) => {
              const def = WIDGET_REGISTRY[widgetId];
              const enabled = localConfig.has(widgetId);

              return (
                <button
                  key={widgetId}
                  type="button"
                  onClick={() => handleToggle(widgetId)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors hover:bg-[#313338]"
                >
                  <div className="mr-3 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#DBDEE1]">
                        {def.label}
                      </span>
                      <span className="rounded bg-[#383A40] px-1.5 py-0.5 text-[10px] text-[#949BA4]">
                        {def.priority}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#949BA4]">
                      {def.description}
                    </p>
                  </div>

                  {/* Toggle switch */}
                  <div
                    className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                      enabled ? "bg-[#E32C19]" : "bg-[#383A40]"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        enabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[#3F4147] px-5 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handleResetDefaults}>
              Reset to defaults
            </Button>

            <span className="text-xs text-[#949BA4]">
              {status === "saving" && "Saving..."}
              {status === "saved" && "Saved"}
              {status === "error" && "Failed to save"}
              {status === "idle" && "\u00A0"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
