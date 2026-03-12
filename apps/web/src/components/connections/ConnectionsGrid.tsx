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
  kick: null,
};

type ConnectionsGridProps = {
  callbackPath?: string;
};

export function ConnectionsGrid({
  callbackPath = "/connections",
}: ConnectionsGridProps) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.platform.listConnections.useQuery();
  const disconnectMutation = trpc.platform.disconnect.useMutation({
    onSuccess: async () => {
      await utils.platform.listConnections.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6 text-sm text-[#949BA4]">
        Loading platform connections...
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(data ?? []).map((entry) => (
        <PlatformCard
          key={entry.platform}
          platform={entry.platform}
          config={entry.config}
          connection={entry.connection}
          oauthProviderReady={entry.oauthProviderReady}
          onConnect={() => {
            const provider = PLATFORM_PROVIDER[entry.platform];
            if (!provider) return;
            void signIn(provider, { callbackUrl: callbackPath });
          }}
          onDisconnect={() => {
            void disconnectMutation.mutateAsync({ platform: entry.platform });
          }}
        />
      ))}
    </div>
  );
}
