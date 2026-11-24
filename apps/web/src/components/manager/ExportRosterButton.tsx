"use client";

import { useEffect, useRef, useState } from "react";
import {
  CaretDown,
  DownloadSimple,
  FileCsv,
  FilePdf,
  Spinner,
} from "@phosphor-icons/react";
import { trpc } from "@/lib/trpc";
import { downloadFile } from "@/lib/download";
import { cn } from "@/lib/utils";
import { ExportPdfSettingsModal } from "./ExportPdfSettingsModal";

type ExportRosterButtonProps = {
  disabled?: boolean;
};

export function ExportRosterButton({
  disabled = false,
}: ExportRosterButtonProps) {
  const [open, setOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const exportMutation = trpc.talentManager.exportRoster.useMutation({
    onSuccess: (result) => {
      downloadFile({
        filename: result.filename,
        mimeType: result.mimeType,
        content: result.content,
      });
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
    onSettled: () => {
      setOpen(false);
    },
  });

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const isLoading = exportMutation.isPending;
  const isDisabled = disabled || isLoading;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        disabled={isDisabled}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-md border border-n-line bg-white px-3 text-sm font-medium transition-colors",
          isDisabled
            ? "cursor-not-allowed text-n-slate"
            : "text-n-ink hover:bg-n-surface hover:text-n-ink",
        )}
      >
        {isLoading ? (
          <Spinner size={14} className="animate-spin" />
        ) : (
          <DownloadSimple size={14} weight="bold" />
        )}
        Export
        <CaretDown
          size={10}
          weight="bold"
          className={cn(
            "transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </button>

      {open && !isDisabled && (
        <div className="absolute right-0 top-full z-50 pt-2">
          <div
            role="group"
            aria-label="Export format"
            className="w-56 overflow-hidden rounded-lg border border-n-line bg-n-surface shadow-lg"
          >
            <button
              type="button"
              onClick={() => exportMutation.mutate({ format: "csv" })}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-n-surface"
            >
              <FileCsv size={18} weight="duotone" className="text-n-success" />
              <div>
                <p className="text-sm font-semibold text-n-ink">CSV</p>
                <p className="text-xs text-n-slate">Spreadsheet (.csv)</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPdfModalOpen(true);
              }}
              className="flex w-full items-center gap-3 border-t border-n-line px-4 py-3 text-left transition-colors hover:bg-n-surface"
            >
              <FilePdf size={18} weight="duotone" className="text-n-error" />
              <div>
                <p className="text-sm font-semibold text-n-ink">PDF</p>
                <p className="text-xs text-n-slate">Pitch-ready report</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full mt-2 max-w-xs rounded-md border border-n-error/40 bg-n-error/10 px-3 py-1.5 text-xs text-n-error"
        >
          {error}
        </p>
      )}

      <ExportPdfSettingsModal
        open={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
      />
    </div>
  );
}
