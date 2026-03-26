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
    await changePassword.mutateAsync({ currentPassword, newPassword });
  }

  const INPUT_CLS =
    "w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#F2F3F5] outline-none focus:border-[#4E5058] placeholder:text-[#949BA4]";

  return (
    <div className="max-w-3xl space-y-6">
      {hasPassword ? (
        <Card>
          <h2 className="text-lg font-semibold text-[#F2F3F5]">
            Change Password
          </h2>
          <form onSubmit={onSubmitPassword} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm text-[#DBDEE1]">
                Current password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={INPUT_CLS}
                placeholder="Enter current password"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#DBDEE1]">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={INPUT_CLS}
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#DBDEE1]">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={INPUT_CLS}
                placeholder="Confirm new password"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={changePassword.isPending}
            >
              {changePassword.isPending ? "Updating..." : "Change Password"}
            </Button>
          </form>
        </Card>
      ) : (
        <Card>
          <h2 className="text-lg font-semibold text-[#F2F3F5]">Password</h2>
          <p className="mt-2 text-sm text-[#949BA4]">
            Your account uses OAuth sign-in. No password is set.
          </p>
        </Card>
      )}

      <Card className="border-[#7f1d1d] bg-[#3f1f24]">
        <h2 className="text-lg font-semibold text-[#F2F3F5]">Danger Zone</h2>
        <p className="mt-2 text-sm text-[#fecaca]">
          Deleting your account will remove sessions and disconnect claimed
          profile ownership. This action cannot be undone.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4 border border-[#dc2626] text-[#fecaca]"
          onClick={() => {
            const confirmed = window.confirm(
              "Delete account permanently? This action cannot be undone.",
            );
            if (!confirmed) return;
            void deleteAccount.mutateAsync();
          }}
          disabled={deleteAccount.isPending}
        >
          {deleteAccount.isPending ? "Deleting..." : "Delete Account"}
        </Button>
      </Card>

      {status && <p className="text-sm text-[#DBDEE1]">{status}</p>}
    </div>
  );
}
