"use client";

import { useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";

type IndustryInquiryCTAProps = {
  name: string;
  email: string;
  company: string;
};

type SubmitState = "idle" | "submitting" | "success" | "error";

// Concrete prompts that seed the textarea — they double as "here's what you can
// ask for" copy and as one-tap starters for the message.
const EXAMPLE_PROMPTS: { label: string; seed: string }[] = [
  {
    label: "Cross-platform benchmarking",
    seed: "We'd like to benchmark a set of channels across Twitch, YouTube, and Kick — ",
  },
  {
    label: "Sponsorship & brand-deal performance",
    seed: "We're evaluating sponsorship performance for a specific game/category — ",
  },
  {
    label: "Emerging creator discovery",
    seed: "We're looking to discover emerging creators in a category or region — ",
  },
  {
    label: "Audience demographics & overlap",
    seed: "We need audience demographics and channel overlap for — ",
  },
  {
    label: "Historical trends (12m+)",
    seed: "We need historical viewership trends going back further than 12 months for — ",
  },
  {
    label: "Esports & tournament viewership",
    seed: "We'd like an esports/tournament viewership breakdown for — ",
  },
];

export function IndustryInquiryCTA({
  name: initialName,
  email: initialEmail,
  company: initialCompany,
}: IndustryInquiryCTAProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [company, setCompany] = useState(initialCompany);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canSubmit =
    name.trim() !== "" &&
    email.trim() !== "" &&
    company.trim() !== "" &&
    message.trim() !== "" &&
    state !== "submitting";

  function applyPrompt(seed: string) {
    setMessage((prev) => (prev.trim() === "" ? seed : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setState("submitting");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/reports/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, message }),
      });
      const data = (await res.json()) as {
        data?: { submitted?: boolean };
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Submission failed");
      }
      setState("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }

  return (
    <div className="n-form mt-16 border-t border-n-line bg-n-surface">
      {/* Header */}
      <div className="border-b border-n-line px-6 py-6">
        <div className="mb-6 flex">
          <Wordmark />
        </div>
        <h2 className="text-xl font-bold text-n-ink">
          Need something more custom?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-n-ink">
          Our analysts pull bespoke industry data across every major
          live-streaming platform. Tell us what you&apos;re after and we&apos;ll
          come back with a tailored quote — no combination is too specific.
        </p>
      </div>

      {state === "success" ? (
        <div
          role="status"
          className="flex flex-col items-center px-6 py-12 text-center"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-n-success/10">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              className="text-n-success"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-n-ink">
            Request sent — thank you!
          </h3>
          <p className="mt-2 max-w-md text-sm text-n-slate">
            Our team will review your inquiry and get back to you at{" "}
            <span className="text-n-ink">{email}</span> shortly. A confirmation
            is on its way to your inbox.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="px-6 py-6">
          {/* Example prompts */}
          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-n-slate">
              Things you can ask for
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPrompt(p.seed)}
                  className="rounded-full border border-n-line bg-n-surface px-3 py-1.5 text-xs font-medium text-n-ink transition-colors hover:border-n-red/50 hover:text-n-ink"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pre-filled contact details */}
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="inquiry-name"
                className="mb-1 block text-xs font-medium text-n-slate"
              >
                Name
              </label>
              <input
                id="inquiry-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-n-line bg-white px-3 py-2 text-sm text-n-ink outline-none transition-colors focus:border-n-red/50"
              />
            </div>
            <div>
              <label
                htmlFor="inquiry-email"
                className="mb-1 block text-xs font-medium text-n-slate"
              >
                Email
              </label>
              <input
                id="inquiry-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-n-line bg-white px-3 py-2 text-sm text-n-ink outline-none transition-colors focus:border-n-red/50"
              />
            </div>
            <div>
              <label
                htmlFor="inquiry-company"
                className="mb-1 block text-xs font-medium text-n-slate"
              >
                Company
              </label>
              <input
                id="inquiry-company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-lg border border-n-line bg-white px-3 py-2 text-sm text-n-ink outline-none transition-colors focus:border-n-red/50"
              />
            </div>
          </div>

          {/* Message */}
          <div>
            <label
              htmlFor="inquiry-message"
              className="mb-1 block text-xs font-medium text-n-slate"
            >
              What data are you after?
            </label>
            <textarea
              id="inquiry-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="Describe the metrics, platforms, channels, categories, or time range you'd like us to pull…"
              className="w-full resize-y rounded-lg border border-n-line bg-white px-4 py-3 text-sm text-n-ink placeholder-n-slate outline-none transition-colors focus:border-n-red/50"
            />
          </div>

          {/* Footer */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {state === "error" ? (
              <p role="alert" className="text-sm text-n-error">
                {errorMsg ?? "Something went wrong — please try again."}
              </p>
            ) : (
              <p className="text-xs text-n-slate">
                We typically reply within 24 hours.
              </p>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-lg bg-n-red px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-n-red-hover disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {state === "submitting" ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Sending…
                </span>
              ) : (
                "Send Request"
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
