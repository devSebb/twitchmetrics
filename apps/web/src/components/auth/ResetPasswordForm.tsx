"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

type ResetPasswordFormProps = {
  token: string;
};

function getValidationError(password: string, confirmPassword: string) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password must be 128 characters or less.";
  if (password !== confirmPassword) return "Passwords do not match.";
  return null;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validationError = useMemo(
    () => getValidationError(password, confirmPassword),
    [password, confirmPassword],
  );

  const canSubmit = useMemo(
    () => token.length > 0 && !validationError && !isSubmitting,
    [token, validationError, isSubmitting],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    setIsSubmitting(false);

    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;

    if (!response.ok) {
      setError(payload?.error ?? "Unable to reset your password.");
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setMessage(payload?.message ?? "Your password has been reset.");
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-[#f87171]">Invalid or expired reset link.</p>
        <Link
          href="/forgot-password"
          className="text-sm text-[#DBDEE1] hover:text-white"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div>
        <label
          htmlFor="reset-password"
          className="mb-1 block text-sm text-[#DBDEE1]"
        >
          New Password
        </label>
        <div className="relative">
          <input
            id="reset-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2.5 pr-16 text-sm text-[#F2F3F5] outline-none transition-colors placeholder:text-[#949BA4] focus:border-[#E32C19]/70"
            placeholder="New password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div>
        <label
          htmlFor="reset-password-confirm"
          className="mb-1 block text-sm text-[#DBDEE1]"
        >
          Confirm Password
        </label>
        <input
          id="reset-password-confirm"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2.5 text-sm text-[#F2F3F5] outline-none transition-colors placeholder:text-[#949BA4] focus:border-[#E32C19]/70"
          placeholder="Confirm new password"
        />
      </div>

      {validationError && password.length > 0 && (
        <p className="text-sm text-[#f87171]">{validationError}</p>
      )}
      {message && <p className="text-sm text-[#8ddf9a]">{message}</p>}
      {error && <p className="text-sm text-[#f87171]">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Resetting..." : "Reset Password"}
      </button>

      {message && (
        <div className="text-center">
          <Link
            href="/login"
            className="text-sm text-[#DBDEE1] hover:text-white"
          >
            Continue to log in
          </Link>
        </div>
      )}
    </form>
  );
}
