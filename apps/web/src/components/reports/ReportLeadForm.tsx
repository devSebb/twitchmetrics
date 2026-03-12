"use client";

import { useState } from "react";

type FormState = "idle" | "submitting" | "success" | "error";

export function ReportLeadForm() {
  const [state, setState] = useState<FormState>("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");

    try {
      const res = await fetch("/api/reports/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company }),
      });

      if (!res.ok) throw new Error("Failed to submit");
      setState("success");
    } catch {
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/10 px-6 py-8 text-center">
        <p className="text-lg font-semibold text-[#22c55e]">
          Thank you for your interest!
        </p>
        <p className="mt-2 text-sm text-[#949BA4]">
          We&apos;ll be in touch shortly with your report details.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="lead-name"
          className="mb-1 block text-sm font-medium text-[#DBDEE1]"
        >
          Name
        </label>
        <input
          id="lead-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-lg border border-[#3F4147] bg-[#1E1F22] px-4 py-2.5 text-sm text-[#DBDEE1] placeholder-[#949BA4] outline-none transition-colors focus:border-[#E32C19]/50"
        />
      </div>
      <div>
        <label
          htmlFor="lead-email"
          className="mb-1 block text-sm font-medium text-[#DBDEE1]"
        >
          Email
        </label>
        <input
          id="lead-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full rounded-lg border border-[#3F4147] bg-[#1E1F22] px-4 py-2.5 text-sm text-[#DBDEE1] placeholder-[#949BA4] outline-none transition-colors focus:border-[#E32C19]/50"
        />
      </div>
      <div>
        <label
          htmlFor="lead-company"
          className="mb-1 block text-sm font-medium text-[#DBDEE1]"
        >
          Company
        </label>
        <input
          id="lead-company"
          type="text"
          required
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Your company"
          className="w-full rounded-lg border border-[#3F4147] bg-[#1E1F22] px-4 py-2.5 text-sm text-[#DBDEE1] placeholder-[#949BA4] outline-none transition-colors focus:border-[#E32C19]/50"
        />
      </div>

      {state === "error" && (
        <p className="text-sm text-[#ef4444]">
          Something went wrong. Please try again.
        </p>
      )}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="w-full rounded-lg bg-[#E32C19] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615] disabled:opacity-50"
      >
        {state === "submitting" ? "Submitting..." : "Get Your Report"}
      </button>
    </form>
  );
}
