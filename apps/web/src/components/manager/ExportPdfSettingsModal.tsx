"use client";

import { useDialogFocus } from "@/hooks/useDialogFocus";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowSquareOut, Spinner, X } from "@phosphor-icons/react";
import { trpc } from "@/lib/trpc";
import { downloadFile } from "@/lib/download";
import { THEME } from "@/lib/constants/theme";
import { resolveAvatar } from "@/lib/avatar";
import { getSafeImageSrc } from "@/lib/safeImage";
import { cn } from "@/lib/utils";

type ExportPdfSettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function ExportPdfSettingsModal({
  open,
  onClose,
}: ExportPdfSettingsModalProps) {
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, { enabled: open });
  const profileQuery = trpc.talentManager.getMyProfile.useQuery(undefined, {
    enabled: open,
  });

  const defaultColor = useMemo(
    () => profileQuery.data?.brandColor ?? THEME.colors.brandRed,
    [profileQuery.data?.brandColor],
  );
  const [brandColor, setBrandColor] = useState(defaultColor);
  const [error, setError] = useState<string | null>(null);

  // Sync the input when the saved value loads.
  useEffect(() => {
    if (open) setBrandColor(defaultColor);
  }, [open, defaultColor]);

  const exportMutation = trpc.talentManager.exportRoster.useMutation({
    onSuccess: (result) => {
      if (result.mimeType !== "application/pdf" || !("encoding" in result)) {
        setError("Unexpected export response.");
        return;
      }
      const blob = base64ToBlob(result.content, result.mimeType);
      downloadFile({
        filename: result.filename,
        mimeType: result.mimeType,
        content: blob,
      });
      void utils.talentManager.getMyProfile.invalidate();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  useEffect(() => {
    if (!open) {
      setError(null);
      exportMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !exportMutation.isPending) onClose();
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, exportMutation.isPending, onClose]);

  const dialogRef = useDialogFocus(open);
  if (!open) return null;

  const managerAvatar = resolveAvatar("talent_manager", {
    user: { image: meQuery.data?.image ?? null },
    manager: { avatarUrl: profileQuery.data?.avatarUrl ?? null },
  });
  const avatarSrc = getSafeImageSrc(managerAvatar);
  const managerName = meQuery.data?.name ?? "Talent Manager";
  const initial = managerName.charAt(0).toUpperCase() || "?";

  const isValidColor = HEX_PATTERN.test(brandColor);
  const isPending = exportMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
      onClick={() => !isPending && onClose()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-label="Export roster as PDF"
        role="dialog"
        aria-modal
        className="max-h-[85dvh] overflow-y-auto w-full max-w-lg rounded-lg border border-n-line bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-n-line px-5 py-4">
          <h2 className="text-base font-semibold text-n-ink">
            Export roster as PDF
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
            className="rounded-md p-3 text-n-slate transition-colors hover:bg-n-surface hover:text-n-ink disabled:opacity-50"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Logo preview */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-n-slate">
              Cover logo
            </p>
            <div className="flex items-center gap-3">
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt={managerName}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-n-surface text-lg font-bold text-n-ink">
                  {initial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-n-ink">Appears on the PDF cover.</p>
                <Link
                  href="/dashboard/settings"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-n-navy hover:underline"
                >
                  Update in Settings
                  <ArrowSquareOut size={12} weight="bold" />
                </Link>
              </div>
            </div>
          </div>

          {/* Brand color */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-n-slate">
              Brand color
            </p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="PDF brand colour"
                value={brandColor}
                onChange={(event) => setBrandColor(event.target.value)}
                disabled={isPending}
                className="h-10 w-12 cursor-pointer rounded-md border border-n-line bg-white disabled:cursor-not-allowed"
              />
              <input
                type="text"
                aria-label="PDF brand colour hex code"
                value={brandColor}
                onChange={(event) => {
                  const next = event.target.value;
                  setBrandColor(next.startsWith("#") ? next : `#${next}`);
                }}
                disabled={isPending}
                spellCheck={false}
                maxLength={7}
                className={cn(
                  "flex-1 rounded-md border bg-white px-3 py-2 text-sm font-mono uppercase text-n-ink outline-none transition-colors disabled:cursor-not-allowed",
                  isValidColor
                    ? "border-n-line focus:border-n-line"
                    : "border-n-error/60",
                )}
              />
            </div>
            <p className="mt-1.5 text-xs text-n-slate">
              Used for the cover bar, card stripes, and footer accent.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-n-error/40 bg-n-error/10 px-3 py-2 text-xs text-n-error"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-n-line px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-n-ink transition-colors hover:bg-n-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => exportMutation.mutate({ format: "pdf", brandColor })}
            disabled={!isValidColor || isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold text-white transition-colors",
              !isValidColor || isPending
                ? "cursor-not-allowed bg-n-slate"
                : "bg-n-red hover:bg-n-red-hover",
            )}
          >
            {isPending && <Spinner size={14} className="animate-spin" />}
            Export PDF
          </button>
        </div>
      </div>
    </div>
  );
}
