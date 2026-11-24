"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WIDGET_ORDER,
  WIDGET_REGISTRY,
  getDefaultWidgets,
  type WidgetId,
} from "@/lib/constants/widgets";
import { trpc } from "@/lib/trpc";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { groupProfileWidgets } from "@/lib/profile-sections";
import { Button } from "@/components/ui";

type WidgetToggleProps = {
  open: boolean;
  onClose: () => void;
  enabledWidgets: WidgetId[];
  onConfigChange: (config: WidgetId[]) => void;
  profileSlug: string;
  publicDemographicsEnabled: boolean;
};

export function WidgetToggle({
  open,
  onClose,
  enabledWidgets,
  onConfigChange,
  publicDemographicsEnabled,
}: WidgetToggleProps) {
  const [localConfig, setLocalConfig] = useState<Set<WidgetId>>(
    () => new Set(enabledWidgets),
  );
  const [localPublicDemographicsEnabled, setLocalPublicDemographicsEnabled] =
    useState(publicDemographicsEnabled);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevConfigRef = useRef<WidgetId[]>(enabledWidgets);
  const savedPublicDemographicsRef = useRef(publicDemographicsEnabled);

  // Sync with parent when enabledWidgets changes externally
  useEffect(() => {
    setLocalConfig(new Set(enabledWidgets));
  }, [enabledWidgets]);

  useEffect(() => {
    setLocalPublicDemographicsEnabled(publicDemographicsEnabled);
    savedPublicDemographicsRef.current = publicDemographicsEnabled;
  }, [publicDemographicsEnabled]);

  const mutation = trpc.creator.updateWidgetConfig.useMutation({
    onSuccess: (_data, variables) => {
      prevConfigRef.current = WIDGET_ORDER.filter((id) =>
        variables.widgetConfig.includes(id),
      );
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    },
    onError: () => {
      // Rollback on failure
      setStatus("error");
      const rollback = prevConfigRef.current;
      setLocalConfig(new Set(rollback));
      onConfigChange(rollback);
    },
  });

  const publicVisibilityMutation =
    trpc.creator.updatePublicDataVisibility.useMutation({
      onSuccess: (data) => {
        savedPublicDemographicsRef.current = data.publicDemographicsEnabled;
        setLocalPublicDemographicsEnabled(data.publicDemographicsEnabled);
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      },
      onError: () => {
        setStatus("error");
        setLocalPublicDemographicsEnabled(savedPublicDemographicsRef.current);
      },
    });

  const persistConfig = useCallback(
    (config: WidgetId[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setStatus("saving");
        mutation.mutate({ widgetConfig: config });
      }, 400);
    },
    [mutation],
  );

  const handleToggle = useCallback(
    (widgetId: WidgetId) => {
      const next = new Set(localConfig);
      if (next.has(widgetId)) next.delete(widgetId);
      else next.add(widgetId);
      const config = WIDGET_ORDER.filter((id) => next.has(id));
      setLocalConfig(next);
      onConfigChange(config);
      persistConfig(config);
    },
    [localConfig, onConfigChange, persistConfig],
  );

  const handleResetDefaults = useCallback(() => {
    const defaults = getDefaultWidgets();
    setLocalConfig(new Set(defaults));
    onConfigChange(defaults);
    persistConfig(defaults);
  }, [onConfigChange, persistConfig]);

  const handlePublicDemographicsToggle = useCallback(() => {
    const next = !localPublicDemographicsEnabled;
    setLocalPublicDemographicsEnabled(next);
    setStatus("saving");
    publicVisibilityMutation.mutate({ publicDemographicsEnabled: next });
  }, [localPublicDemographicsEnabled, publicVisibilityMutation]);

  // ESC key to close
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const dialogRef = useDialogFocus(open);
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-customisation-title"
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-[90] flex w-full max-w-sm flex-col border-l border-n-line bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-n-line px-5 py-4">
          <h2
            id="profile-customisation-title"
            className="text-base font-semibold text-n-ink"
          >
            Customise profile
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customisation"
            className="rounded-md p-3 text-n-slate transition-colors hover:bg-n-surface hover:text-n-ink"
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
            {groupProfileWidgets(WIDGET_ORDER).map((group) => (
              <section key={group.id} className="mb-6">
                <h3 className="n-eyebrow mb-2 text-n-slate">{group.title}</h3>
                {group.widgets.map((widgetId) => {
                  const def = WIDGET_REGISTRY[widgetId];
                  const enabled = localConfig.has(widgetId);

                  return (
                    <button
                      key={widgetId}
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      disabled={
                        mutation.isPending || publicVisibilityMutation.isPending
                      }
                      onClick={() => handleToggle(widgetId)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors hover:bg-n-surface"
                    >
                      <div className="mr-3 flex-1">
                        <span className="text-sm font-medium text-n-ink">
                          {def.label}
                        </span>
                        <p className="mt-0.5 text-xs text-n-slate">
                          {def.description}
                        </p>
                      </div>

                      {/* Toggle switch */}
                      <div
                        className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                          enabled ? "bg-n-red" : "bg-n-slate"
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
              </section>
            ))}
          </div>

          <div className="mt-6 border-t border-n-line pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-n-slate">
              Public data sharing
            </h3>
            <button
              type="button"
              role="switch"
              aria-checked={localPublicDemographicsEnabled}
              disabled={
                publicVisibilityMutation.isPending || mutation.isPending
              }
              onClick={handlePublicDemographicsToggle}
              className="mt-3 flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors hover:bg-n-surface"
            >
              <div className="mr-3 flex-1">
                <span className="text-sm font-medium text-n-ink">
                  Show audience data publicly
                </span>
                <p className="mt-0.5 text-xs text-n-slate">
                  Share audience demographics from your connected accounts with
                  visitors to your profile.
                </p>
              </div>
              <div
                className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                  localPublicDemographicsEnabled ? "bg-n-red" : "bg-n-slate"
                }`}
              >
                <div
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    localPublicDemographicsEnabled
                      ? "translate-x-4"
                      : "translate-x-0.5"
                  }`}
                />
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-n-line px-5 py-4">
          <div className="flex items-center justify-between">
            <Button
              appearance="noticed"
              variant="ghost"
              size="sm"
              disabled={
                mutation.isPending || publicVisibilityMutation.isPending
              }
              onClick={handleResetDefaults}
            >
              Reset to defaults
            </Button>

            <span role="status" className="text-xs text-n-slate">
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
