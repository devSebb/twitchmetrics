"use client";

import { signIn } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { PlatformCard } from "./PlatformCard";

const PLATFORM_PROVIDER: Record<string, string | null> = {
  twitch: "twitch",
  youtube: "google",
  instagram: "instagram",
  tiktok: "tiktok",
  x: "twitter",
  kick: "kick",
};

type ConnectionsGridProps = {
  callbackPath?: string;
};

export function ConnectionsGrid({
  callbackPath = "/connections",
}: ConnectionsGridProps) {
  const utils = trpc.useUtils();
  const { data, isLoading, isError, refetch } =
    trpc.platform.listConnections.useQuery();
  const disconnectMutation = trpc.platform.disconnect.useMutation({
    onSuccess: async () => {
      await utils.platform.listConnections.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-n-line bg-white p-6 text-sm text-n-slate">
        Loading platform connections...
      </div>
    );
  }

  if (isError)
    return (
      <p role="alert" className="border-t border-n-line py-8 text-n-error">
        Connections could not load.{" "}
        <button type="button" className="underline" onClick={() => refetch()}>
          Try again
        </button>
      </p>
    );

  return (
    <div>
      {disconnectMutation.error && (
        <p role="alert" className="mb-6 text-sm text-n-error">
          {disconnectMutation.error.message}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {(data ?? []).map((entry) => (
          <PlatformCard
            key={entry.platform}
            platform={entry.platform}
            config={entry.config}
            connection={entry.connection}
            oauthProviderReady={entry.oauthProviderReady}
            isBusy={disconnectMutation.isPending}
            onConnect={() => {
              const provider = PLATFORM_PROVIDER[entry.platform];
              if (!provider) return;
              void signIn(provider, { callbackUrl: callbackPath });
            }}
            onDisconnect={() => {
              disconnectMutation.mutate({ platform: entry.platform });
            }}
          />
        ))}
      </div>
    </div>
  );
}
