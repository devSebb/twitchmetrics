"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FormState = "idle" | "submitting" | "error";

export function ReportLeadForm() {
  const router = useRouter();
  const [state, setState] = useState<FormState>("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");

    try {
      const params = new URLSearchParams({ name, email, company });
      router.push(`/reports/request?${params.toString()}`);
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="lead-name"
          className="mb-1 block text-sm font-medium text-n-ink"
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
          className="n-input"
        />
      </div>
      <div>
        <label
          htmlFor="lead-email"
          className="mb-1 block text-sm font-medium text-n-ink"
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
          className="n-input"
        />
      </div>
      <div>
        <label
          htmlFor="lead-company"
          className="mb-1 block text-sm font-medium text-n-ink"
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
          className="n-input"
        />
      </div>

      {state === "error" && (
        <p role="alert" className="text-sm text-n-error">
          Something went wrong. Please try again.
        </p>
      )}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="w-full rounded-lg bg-n-red px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-n-red-hover disabled:opacity-50"
      >
        {state === "submitting" ? "Loading…" : "Continue to Details →"}
      </button>
    </form>
  );
}
