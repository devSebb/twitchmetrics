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
      <p
        role="status"
        className="mt-3 flex items-center gap-2 text-sm text-[var(--noticed-ink)]"
      >
        <CheckCircle
          size={18}
          weight="fill"
          className="flex-shrink-0 text-[var(--noticed-success)]"
        />
        You&apos;re subscribed. Welcome aboard.
      </p>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          required
          maxLength={320}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          aria-label="Email address"
          className="n-input min-w-0 flex-1"
        />
        <button
          type="submit"
          disabled={state === "submitting"}
          aria-label="Subscribe to the newsletter"
          className="n-button n-button-primary !rounded-md !px-4"
        >
          {state === "submitting" ? "Subscribing…" : "Subscribe"}
        </button>
      </form>
      {state === "error" && error && (
        <p role="alert" className="mt-2 text-xs text-[var(--noticed-error)]">
          {error}
        </p>
      )}
    </>
  );
}
