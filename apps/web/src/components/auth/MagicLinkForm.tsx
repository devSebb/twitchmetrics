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
      <p className="rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-2 text-sm text-[#86efac]">
        Magic link sent. Check your inbox for a sign-in link.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor="magic-link-email"
          className="mb-1 block text-sm text-[#DBDEE1]"
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
          className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2.5 text-sm text-[#F2F3F5] outline-none transition-colors placeholder:text-[#949BA4] focus:border-[#E32C19]/70"
        />
      </div>

      {error && <p className="text-sm text-[#f87171]">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Sending..." : "Send Magic Link"}
      </button>
    </form>
  );
}
