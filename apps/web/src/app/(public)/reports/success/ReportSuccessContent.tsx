"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type State =
  | { status: "loading" }
  | { status: "ready"; purchaseId: string; templateName: string }
  | {
      status: "downloaded";
      purchaseId: string;
      templateName: string;
      filename: string;
    }
  | { status: "quote" }
  | { status: "error"; message: string };

export function ReportSuccessContent() {
  const params = useSearchParams();
  const [state, setState] = useState<State>({ status: "loading" });
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    const mode = params.get("mode");
    const sessionId = params.get("session_id");
    const purchaseId = params.get("purchase_id");

    if (mode === "quote") {
      setState({ status: "quote" });
      return;
    }

    const url = purchaseId
      ? `/api/reports/verify?purchase_id=${purchaseId}`
      : sessionId
        ? `/api/reports/verify?session_id=${sessionId}`
        : null;

    if (!url) {
      setState({ status: "error", message: "No payment reference found." });
      return;
    }

    fetch(url)
      .then((r) => r.json())
      .then(
        (data: {
          purchase?: { id: string; templateName: string };
          error?: string;
        }) => {
          if (data.purchase) {
            setState({
              status: "ready",
              purchaseId: data.purchase.id,
              templateName: data.purchase.templateName,
            });
          } else {
            setState({
              status: "error",
              message: data.error ?? "Verification failed.",
            });
          }
        },
      )
      .catch(() =>
        setState({
          status: "error",
          message: "Network error during verification.",
        }),
      );
  }, [params]);

  async function handleDownload() {
    if (state.status !== "ready") return;
    const { purchaseId, templateName } = state;
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(
        `/api/reports/download?purchase_id=${purchaseId}`,
      );
      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get("Content-Disposition") ?? "";
      const filename = cd.match(/filename="([^"]+)"/)?.[1] ?? "report.csv";

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setState({ status: "downloaded", purchaseId, templateName, filename });
    } catch (err) {
      setDownloadError(
        err instanceof Error && err.message
          ? err.message
          : "We couldn't generate the report. Please try again.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1E1F22] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#3F4147] bg-[#2B2D31] p-8 text-center">
        {state.status === "loading" && (
          <>
            <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-[#3F4147] border-t-[#E32C19]" />
            <p className="text-sm text-[#949BA4]">Verifying your payment…</p>
          </>
        )}

        {state.status === "quote" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#22c55e]/10">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className="mb-1 text-xl font-bold text-[#F2F3F5]">
              Request received
            </h2>
            <p className="mb-6 text-sm leading-relaxed text-[#DBDEE1]">
              Thanks for the details. Our team will review your request and
              reach out within{" "}
              <span className="font-semibold text-[#F2F3F5]">24 hours</span>{" "}
              with a custom quote for your report.
            </p>
            <Link
              href="/reports"
              className="inline-block rounded-lg bg-[#383A40] px-6 py-2.5 text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
            >
              Back to Reports
            </Link>
            <p className="mt-6 text-xs text-[#4E5058]">
              Keep an eye on your inbox — we&apos;ll reply to the email you
              provided.
            </p>
          </>
        )}

        {state.status === "error" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#ef4444]/10">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-bold text-[#F2F3F5]">
              Verification Failed
            </h2>
            <p className="mb-6 text-sm text-[#949BA4]">{state.message}</p>
            <Link
              href="/reports"
              className="text-sm text-[#E32C19] underline underline-offset-2"
            >
              Back to Reports
            </Link>
          </>
        )}

        {state.status === "ready" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#22c55e]/10">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className="mb-1 text-xl font-bold text-[#F2F3F5]">
              Payment Confirmed
            </h2>
            <p className="mb-2 text-sm font-medium text-[#DBDEE1]">
              {state.templateName}
            </p>
            <p className="mb-8 text-sm text-[#949BA4]">
              Your report is ready. Click below to download it as a CSV file.
            </p>

            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="w-full rounded-lg bg-[#E32C19] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615] disabled:opacity-50"
            >
              {downloading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Generating…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download Report (CSV)
                </span>
              )}
            </button>

            {downloadError && (
              <p className="mt-4 text-xs text-[#ef4444]">{downloadError}</p>
            )}

            <p className="mt-6 text-xs text-[#4E5058]">
              You can re-download this report at any time using this page link —
              we&apos;ve also emailed you a confirmation that includes it.
            </p>
          </>
        )}

        {state.status === "downloaded" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#22c55e]/10">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className="mb-1 text-xl font-bold text-[#F2F3F5]">
              Report Downloaded
            </h2>
            <p className="mb-2 text-sm font-medium text-[#DBDEE1]">
              {state.templateName}
            </p>
            <p className="mb-8 text-sm text-[#949BA4]">
              <span className="font-mono text-[#DBDEE1]">{state.filename}</span>{" "}
              has been saved to your device.
            </p>

            <Link
              href="/reports"
              className="inline-block w-full rounded-lg bg-[#383A40] px-6 py-3 text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
            >
              Back to Reports
            </Link>

            <button
              type="button"
              onClick={() =>
                setState({
                  status: "ready",
                  purchaseId: state.purchaseId,
                  templateName: state.templateName,
                })
              }
              className="mt-3 text-xs text-[#949BA4] underline-offset-2 hover:underline"
            >
              Download again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
