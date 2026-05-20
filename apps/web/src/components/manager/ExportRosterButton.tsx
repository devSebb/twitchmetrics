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
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={isDisabled}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-md border border-[#3F4147] bg-[#1E1F22] px-3 text-sm font-medium transition-colors",
          isDisabled
            ? "cursor-not-allowed text-[#5C5F66]"
            : "text-[#DBDEE1] hover:bg-[#2B2D31] hover:text-[#F2F3F5]",
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
            role="menu"
            className="w-56 overflow-hidden rounded-lg border border-[#3F4147] bg-[#2B2D31] shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => exportMutation.mutate({ format: "csv" })}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#383A40]"
            >
              <FileCsv size={18} weight="duotone" className="text-[#22c55e]" />
              <div>
                <p className="text-sm font-semibold text-[#F2F3F5]">CSV</p>
                <p className="text-xs text-[#949BA4]">Spreadsheet (.csv)</p>
              </div>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setPdfModalOpen(true);
              }}
              className="flex w-full items-center gap-3 border-t border-[#3F4147] px-4 py-3 text-left transition-colors hover:bg-[#383A40]"
            >
              <FilePdf size={18} weight="duotone" className="text-[#ef4444]" />
              <div>
                <p className="text-sm font-semibold text-[#F2F3F5]">PDF</p>
                <p className="text-xs text-[#949BA4]">Pitch-ready report</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="absolute right-0 top-full mt-2 max-w-xs rounded-md border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-1.5 text-xs text-[#fca5a5]">
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
