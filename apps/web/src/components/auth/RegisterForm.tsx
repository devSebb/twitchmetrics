"use client";

import { FormEvent, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

type RegisterFormProps = {
  callbackUrl?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterForm({ callbackUrl = "/home" }: RegisterFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validationError = useMemo(() => {
    if (!name.trim()) return "Display name is required.";
    if (!EMAIL_REGEX.test(email.trim())) return "Please enter a valid email.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";
    return null;
  }, [name, email, password, confirmPassword]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      }),
    });

    if (!response.ok) {
      const json = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(json?.error ?? "Unable to register. Please try again.");
      setIsSubmitting(false);
      return;
    }

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      callbackUrl,
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Account created, but automatic login failed. Please log in.");
      router.push(`/login?returnTo=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    if (result?.url) {
      router.push(result.url);
      router.refresh();
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor="register-name"
          className="mb-1 block text-sm text-[#DBDEE1]"
        >
          Display Name
        </label>
        <input
          id="register-name"
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2.5 text-sm text-[#F2F3F5] outline-none transition-colors placeholder:text-[#949BA4] focus:border-[#E32C19]/70"
          placeholder="Your display name"
        />
      </div>

      <div>
        <label
          htmlFor="register-email"
          className="mb-1 block text-sm text-[#DBDEE1]"
        >
          Email
        </label>
        <input
          id="register-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2.5 text-sm text-[#F2F3F5] outline-none transition-colors placeholder:text-[#949BA4] focus:border-[#E32C19]/70"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label
          htmlFor="register-password"
          className="mb-1 block text-sm text-[#DBDEE1]"
        >
          Password
        </label>
        <input
          id="register-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2.5 text-sm text-[#F2F3F5] outline-none transition-colors placeholder:text-[#949BA4] focus:border-[#E32C19]/70"
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <label
          htmlFor="register-confirm-password"
          className="mb-1 block text-sm text-[#DBDEE1]"
        >
          Confirm Password
        </label>
        <input
          id="register-confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2.5 text-sm text-[#F2F3F5] outline-none transition-colors placeholder:text-[#949BA4] focus:border-[#E32C19]/70"
          placeholder="Repeat password"
        />
      </div>

      {(error ?? validationError) && (
        <p className="text-sm text-[#f87171]">{error ?? validationError}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Creating account..." : "Create Account"}
      </button>
    </form>
  );
}
