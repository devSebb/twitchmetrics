"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && !isSubmitting,
    [email, isSubmitting],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    setIsSubmitting(false);

    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;

    if (!response.ok) {
      setError(payload?.error ?? "Unable to request a reset link.");
      return;
    }

    setMessage(
      payload?.message ??
        "If a TwitchMetrics account exists for that email, a reset link has been sent.",
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div>
        <label
          htmlFor="forgot-password-email"
          className="mb-1 block text-sm text-[#DBDEE1]"
        >
          Email
        </label>
        <input
          id="forgot-password-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2.5 text-sm text-[#F2F3F5] outline-none transition-colors placeholder:text-[#949BA4] focus:border-[#E32C19]/70"
          placeholder="you@example.com"
        />
      </div>

      {message && <p className="text-sm text-[#8ddf9a]">{message}</p>}
      {error && <p className="text-sm text-[#f87171]">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Sending..." : "Send Reset Link"}
      </button>

      <div className="text-center">
        <Link href="/login" className="text-sm text-[#DBDEE1] hover:text-white">
          Back to log in
        </Link>
      </div>
    </form>
  );
}
