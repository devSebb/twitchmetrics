"use client";

import { useState } from "react";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";

type FormState = "idle" | "submitting" | "success" | "error";

export function NewsletterForm() {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setError(null);

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Something went wrong. Please try again.");
        setState("error");
        return;
      }

      setState("success");
    } catch {
      setError("Something went wrong. Please try again.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-[#DBDEE1]">
        <CheckCircle
          size={18}
          weight="fill"
          className="flex-shrink-0 text-[#22c55e]"
        />
        You&apos;re subscribed — welcome aboard.
      </p>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="email"
          required
          maxLength={320}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          aria-label="Email address"
          className="w-0 flex-1 rounded-md border border-[#3F4147] bg-[#313338] px-3 py-2 text-sm text-[#DBDEE1] placeholder-[#949BA4] outline-none focus:border-[#E32C19]"
        />
        <button
          type="submit"
          disabled={state === "submitting"}
          aria-label="Subscribe to the newsletter"
          className="rounded-md bg-[#E32C19] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#C72615] disabled:opacity-50"
        >
          {state === "submitting" ? "…" : "→"}
        </button>
      </form>
      {state === "error" && error && (
        <p role="alert" className="mt-2 text-xs text-[#ef4444]">
          {error}
        </p>
      )}
    </>
  );
}
