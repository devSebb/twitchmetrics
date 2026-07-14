"use client";

import { useState } from "react";
import Image from "next/image";

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
    <div className="mt-8 overflow-hidden rounded-xl border border-[#3F4147] bg-gradient-to-b from-[#313338] to-[#2B2D31]">
      {/* Header */}
      <div className="border-b border-[#3F4147] px-6 py-6">
        <div className="mb-3 flex h-8">
          <Image
            src="/brand/logo.png"
            alt="TwitchMetrics"
            width={160}
            height={42}
            className="h-8 w-auto object-contain object-left"
          />
        </div>
        <h2 className="text-xl font-bold text-[#F2F3F5]">
          Need something more custom?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#DBDEE1]">
          Our analysts pull bespoke industry data across every major
          live-streaming platform. Tell us what you&apos;re after and we&apos;ll
          come back with a tailored quote — no combination is too specific.
        </p>
      </div>

      {state === "success" ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#22c55e]/10">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#22c55e"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[#F2F3F5]">
            Request sent — thank you!
          </h3>
          <p className="mt-2 max-w-md text-sm text-[#949BA4]">
            Our team will review your inquiry and get back to you at{" "}
            <span className="text-[#DBDEE1]">{email}</span> shortly. A
            confirmation is on its way to your inbox.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="px-6 py-6">
          {/* Example prompts */}
          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#949BA4]">
              Things you can ask for
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPrompt(p.seed)}
                  className="rounded-full border border-[#3F4147] bg-[#383A40] px-3 py-1.5 text-xs font-medium text-[#DBDEE1] transition-colors hover:border-[#E32C19]/50 hover:text-[#F2F3F5]"
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
                className="mb-1 block text-xs font-medium text-[#949BA4]"
              >
                Name
              </label>
              <input
                id="inquiry-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[#3F4147] bg-[#1E1F22] px-3 py-2 text-sm text-[#DBDEE1] outline-none transition-colors focus:border-[#E32C19]/50"
              />
            </div>
            <div>
              <label
                htmlFor="inquiry-email"
                className="mb-1 block text-xs font-medium text-[#949BA4]"
              >
                Email
              </label>
              <input
                id="inquiry-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[#3F4147] bg-[#1E1F22] px-3 py-2 text-sm text-[#DBDEE1] outline-none transition-colors focus:border-[#E32C19]/50"
              />
            </div>
            <div>
              <label
                htmlFor="inquiry-company"
                className="mb-1 block text-xs font-medium text-[#949BA4]"
              >
                Company
              </label>
              <input
                id="inquiry-company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-lg border border-[#3F4147] bg-[#1E1F22] px-3 py-2 text-sm text-[#DBDEE1] outline-none transition-colors focus:border-[#E32C19]/50"
              />
            </div>
          </div>

          {/* Message */}
          <div>
            <label
              htmlFor="inquiry-message"
              className="mb-1 block text-xs font-medium text-[#949BA4]"
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
              className="w-full resize-y rounded-lg border border-[#3F4147] bg-[#1E1F22] px-4 py-3 text-sm text-[#DBDEE1] placeholder-[#4E5058] outline-none transition-colors focus:border-[#E32C19]/50"
            />
          </div>

          {/* Footer */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {state === "error" ? (
              <p className="text-xs text-[#ef4444]">
                {errorMsg ?? "Something went wrong — please try again."}
              </p>
            ) : (
              <p className="text-xs text-[#6D7178]">
                We typically reply within 24 hours.
              </p>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-lg bg-[#E32C19] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
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
