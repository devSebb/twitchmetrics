"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { Button, Card } from "@/components/ui";

type SecuritySettingsProps = {
  hasPassword: boolean;
};

export function SecuritySettings({ hasPassword }: SecuritySettingsProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus("Password updated.");
    },
    onError: (error) => setStatus(error.message),
  });

  const deleteAccount = trpc.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      await signOut({ callbackUrl: "/" });
    },
    onError: (error) => setStatus(error.message),
  });

  async function onSubmitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    if (newPassword.length < 8) {
      setStatus("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus("New password and confirmation do not match.");
      return;
    }
    changePassword.mutate({ currentPassword, newPassword });
  }

  const INPUT_CLS = "n-input";

  return (
    <div className="max-w-3xl space-y-6">
      {hasPassword ? (
        <Card appearance="noticed">
          <h2 className="text-lg font-semibold text-n-ink">Change Password</h2>
          <form onSubmit={onSubmitPassword} className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="security-currentPassword"
                className="mb-1 block text-sm text-n-ink"
              >
                Current password
              </label>
              <input
                type="password"
                id="security-currentPassword"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={INPUT_CLS}
                placeholder="Enter current password"
              />
            </div>
            <div>
              <label
                htmlFor="security-newPassword"
                className="mb-1 block text-sm text-n-ink"
              >
                New password
              </label>
              <input
                type="password"
                id="security-newPassword"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={INPUT_CLS}
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label
                htmlFor="security-confirmPassword"
                className="mb-1 block text-sm text-n-ink"
              >
                Confirm new password
              </label>
              <input
                type="password"
                id="security-confirmPassword"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={INPUT_CLS}
                placeholder="Confirm new password"
              />
            </div>
            <Button
              appearance="noticed"
              type="submit"
              variant="secondary"
              disabled={changePassword.isPending}
            >
              {changePassword.isPending ? "Updating..." : "Change Password"}
            </Button>
          </form>
        </Card>
      ) : (
        <Card appearance="noticed">
          <h2 className="text-lg font-semibold text-n-ink">Password</h2>
          <p className="mt-2 text-sm text-n-slate">
            Your account uses OAuth sign-in. No password is set.
          </p>
        </Card>
      )}

      <Card appearance="noticed" className="border-n-error/30 bg-n-error/5">
        <h2 className="text-lg font-semibold text-n-ink">Danger Zone</h2>
        <p className="mt-2 text-sm text-n-error">
          Deleting your account will remove sessions and disconnect claimed
          profile ownership. This action cannot be undone.
        </p>
        <Button
          appearance="noticed"
          type="button"
          variant="secondary"
          className="mt-4 border border-n-error text-n-error"
          onClick={() => {
            const confirmed = window.confirm(
              "Delete account permanently? This action cannot be undone.",
            );
            if (!confirmed) return;
            deleteAccount.mutate();
          }}
          disabled={deleteAccount.isPending}
        >
          {deleteAccount.isPending ? "Deleting..." : "Delete Account"}
        </Button>
      </Card>

      {status && (
        <p role="status" className="text-sm text-n-ink">
          {status}
        </p>
      )}
    </div>
  );
}
