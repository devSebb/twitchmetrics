"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { Button, Card } from "@/components/ui";
import {
  WIDGET_ORDER,
  WIDGET_REGISTRY,
  type WidgetId,
} from "@/lib/constants/widgets";

type SettingsFormProps = {
  name: string | null;
  email: string | null;
  image: string | null;
  hasPassword: boolean;
  connectedPlatforms: string[];
  creatorSlug: string | null;
  isClaimed: boolean;
};

export function SettingsForm({
  name,
  email,
  image,
  hasPassword,
  connectedPlatforms,
  creatorSlug,
  isClaimed,
}: SettingsFormProps) {
  const [displayName, setDisplayName] = useState(name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const updateName = trpc.auth.updateName.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      setStatus("Display name updated.");
    },
    onError: (error) => setStatus(error.message),
  });

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

  async function onSubmitName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      setStatus("Display name is required.");
      return;
    }
    await updateName.mutateAsync({ name: trimmed });
  }

  async function onSubmitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-[#F2F3F5]">
          Profile settings
        </h2>
        <form onSubmit={onSubmitName} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm text-[#DBDEE1]">
              Display name
            </label>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#F2F3F5]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[#DBDEE1]">Email</label>
            <input
              value={email ?? ""}
              disabled
              className="w-full rounded-lg border border-[#3F4147] bg-[#2B2D31] px-3 py-2 text-sm text-[#949BA4]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[#DBDEE1]">Avatar</label>
            <input
              value={image ?? "Connected via OAuth"}
              disabled
              className="w-full rounded-lg border border-[#3F4147] bg-[#2B2D31] px-3 py-2 text-sm text-[#949BA4]"
            />
          </div>
          <Button type="submit" disabled={updateName.isPending}>
            {updateName.isPending ? "Saving..." : "Save profile"}
          </Button>
        </form>
      </Card>

      {hasPassword ? (
        <Card>
          <h2 className="text-lg font-semibold text-[#F2F3F5]">Password</h2>
          <form onSubmit={onSubmitPassword} className="mt-4 space-y-3">
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#F2F3F5]"
            />
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#F2F3F5]"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#F2F3F5]"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={changePassword.isPending}
            >
              {changePassword.isPending ? "Updating..." : "Change password"}
            </Button>
          </form>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold text-[#F2F3F5]">
          Notification preferences
        </h2>
        <div className="mt-4 space-y-2 text-sm text-[#949BA4]">
          <p>Email notifications for claim updates (coming soon)</p>
          <p>Weekly analytics digest (coming soon)</p>
          <p>Connection alerts (coming soon)</p>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[#F2F3F5]">
          Connected accounts
        </h2>
        <div className="mt-4 space-y-2 text-sm text-[#DBDEE1]">
          {connectedPlatforms.length > 0 ? (
            connectedPlatforms.map((platform) => (
              <p key={platform}>{platform}</p>
            ))
          ) : (
            <p className="text-[#949BA4]">No connected platforms yet.</p>
          )}
        </div>
        <a
          href="/dashboard/connections"
          className="mt-3 inline-block text-sm text-[#93c5fd] hover:underline"
        >
          Manage connections
        </a>
      </Card>

      {/* Widget Preferences */}
      <Card>
        <h2 className="text-lg font-semibold text-[#F2F3F5]">
          Widget preferences
        </h2>
        <p className="mt-1 text-sm text-[#949BA4]">
          Control which widgets appear on your dashboard. You can also toggle
          widgets from the gear icon on the dashboard.
        </p>
        <div className="mt-4 space-y-1">
          {WIDGET_ORDER.map((widgetId) => {
            const def = WIDGET_REGISTRY[widgetId];
            return (
              <div
                key={widgetId}
                className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-[#383A40]"
              >
                <div>
                  <span className="text-sm text-[#DBDEE1]">{def.label}</span>
                  <span className="ml-2 rounded bg-[#383A40] px-1.5 py-0.5 text-[10px] text-[#949BA4]">
                    {def.priority}
                  </span>
                </div>
                <span className="text-xs text-[#949BA4]">
                  {def.defaultEnabled ? "On by default" : "Off by default"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-[#949BA4]">
          Use the dashboard widget toggle for real-time changes.
        </p>
      </Card>

      {/* Media Kit */}
      {creatorSlug && (
        <Card>
          <h2 className="text-lg font-semibold text-[#F2F3F5]">Media kit</h2>
          <p className="mt-1 text-sm text-[#949BA4]">
            Your public media kit page showcases your analytics and brand
            partnerships to potential sponsors.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Link href={`/creator/${creatorSlug}/media-kit`}>
              <Button variant="secondary" size="sm">
                View Media Kit
              </Button>
            </Link>
            {!isClaimed && (
              <span className="text-xs text-[#949BA4]">
                Claim your profile to unlock full media kit features.
              </span>
            )}
          </div>
        </Card>
      )}

      <Card className="border-[#7f1d1d] bg-[#3f1f24]">
        <h2 className="text-lg font-semibold text-[#F2F3F5]">Danger zone</h2>
        <p className="mt-2 text-sm text-[#fecaca]">
          Deleting your account will remove sessions and disconnect claimed
          profile ownership.
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
          {deleteAccount.isPending ? "Deleting..." : "Delete account"}
        </Button>
      </Card>

      {status ? <p className="text-sm text-[#DBDEE1]">{status}</p> : null}
    </div>
  );
}
