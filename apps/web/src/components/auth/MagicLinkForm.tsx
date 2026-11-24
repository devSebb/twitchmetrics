"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

type MagicLinkFormProps = {
  callbackUrl?: string;
};

export function MagicLinkForm({ callbackUrl = "/home" }: MagicLinkFormProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setError(null);

    const result = await signIn("email", {
      email: email.trim(),
      callbackUrl,
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Could not send magic link. Please try again.");
      return;
    }

    setIsSent(true);
  }

  if (isSent) {
    return (
      <p className="rounded-lg border border-n-success/30 bg-n-success/10 px-3 py-2 text-sm text-n-success">
        Magic link sent. Check your inbox for a sign-in link.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor="magic-link-email"
          className="mb-1 block text-sm text-n-ink"
        >
          Email
        </label>
        <input
          id="magic-link-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-n-line bg-n-surface px-3 py-2.5 text-sm text-n-ink outline-none transition-colors placeholder:text-n-slate focus:border-n-red/70"
        />
      </div>

      {error && <p className="text-sm text-n-error">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-n-red px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-n-red-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Sending..." : "Send Magic Link"}
      </button>
    </form>
  );
}
