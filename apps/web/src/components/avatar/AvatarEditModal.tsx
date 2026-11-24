"use client";

import { useDialogFocus } from "@/hooks/useDialogFocus";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, UploadSimple, Trash, Spinner } from "@phosphor-icons/react";
import { useAvatarUpload } from "@/hooks/useAvatarUpload";
import { cn } from "@/lib/utils";

type AvatarEditModalProps = {
  open: boolean;
  onClose: () => void;
  currentUrl: string | null;
  onUpdated?: ((newUrl: string | null) => void) | undefined;
};

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

export function AvatarEditModal({
  open,
  onClose,
  currentUrl,
  onUpdated,
}: AvatarEditModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { upload, remove, status, error, isBusy } = useAvatarUpload({
    onUploaded: (url) => {
      onUpdated?.(url);
      onClose();
    },
    onRemoved: () => {
      onUpdated?.(null);
      onClose();
    },
  });

  const reset = useCallback(() => {
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setValidationError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) onClose();
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, isBusy, onClose]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = (next: File) => {
    setValidationError(null);
    if (!ACCEPT.split(",").includes(next.type)) {
      setValidationError("Use JPG, PNG, or WebP.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setValidationError("File must be 2 MB or less.");
      return;
    }
    setFile(next);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(next);
    });
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const dropped = event.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const dialogRef = useDialogFocus(open);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
      onClick={() => !isBusy && onClose()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-label="Update profile picture"
        role="dialog"
        aria-modal
        className="max-h-[85dvh] overflow-y-auto w-full max-w-lg rounded-lg border border-n-line bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-n-line px-5 py-4">
          <h2 className="text-base font-semibold text-n-ink">
            Update profile picture
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close"
            className="rounded-md p-3 text-n-slate transition-colors hover:bg-n-surface hover:text-n-ink disabled:opacity-50"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {previewUrl ? (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Preview"
                className="h-20 w-20 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-n-ink">
                  {file?.name}
                </p>
                <p className="text-xs text-n-slate">
                  {((file?.size ?? 0) / 1024).toFixed(0)} KB · {file?.type}
                </p>
                <button
                  type="button"
                  onClick={reset}
                  disabled={isBusy}
                  className="mt-1 text-xs text-n-slate underline hover:text-n-ink disabled:opacity-50"
                >
                  Choose different file
                </button>
              </div>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose a profile picture, JPG, PNG or WebP, up to 2 MB"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-n-line bg-white px-4 py-8 text-center transition-colors hover:border-n-red/60 hover:bg-white/80",
              )}
            >
              <UploadSimple size={22} weight="bold" className="text-n-slate" />
              <p className="mt-2 text-sm font-medium text-n-ink">
                Drag &amp; drop or click to browse
              </p>
              <p className="mt-1 text-xs text-n-slate">
                JPG, PNG, WebP · max 2 MB
              </p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            aria-label="Profile picture file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              const next = event.target.files?.[0];
              if (next) handleFile(next);
              event.target.value = "";
            }}
          />

          {(validationError || error) && (
            <p
              role="alert"
              className="rounded-md border border-n-error/40 bg-n-error/10 px-3 py-2 text-xs text-n-error"
            >
              {validationError ?? error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-n-line px-5 py-4">
          {currentUrl ? (
            <button
              type="button"
              onClick={remove}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-n-error transition-colors hover:text-n-error disabled:opacity-50"
            >
              <Trash size={14} weight="bold" />
              Remove current
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-n-ink transition-colors hover:bg-n-surface disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => file && upload(file)}
              disabled={!file || isBusy}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold text-white transition-colors",
                !file || isBusy
                  ? "cursor-not-allowed bg-n-slate"
                  : "bg-n-red hover:bg-n-red-hover",
              )}
            >
              {status === "uploading" && (
                <Spinner size={14} className="animate-spin" />
              )}
              Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
