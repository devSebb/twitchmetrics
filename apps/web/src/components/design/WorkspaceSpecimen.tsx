"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observable } from "@trpc/server/observable";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { WorkspaceShell } from "@/components/dashboard/WorkspaceShell";
import { ManagerDashboard } from "@/components/manager/ManagerDashboard";
import { ManagerSettingsForm } from "@/components/settings/manager/ManagerSettingsForm";
import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm";
import { CreatorDetailView } from "@/components/manager/CreatorDetailView";
import { WidgetToggle } from "@/components/dashboard/WidgetToggle";
import { getDefaultWidgets } from "@/lib/constants/widgets";

const user = {
  name: "Preview manager",
  email: "preview@example.test",
  image: null,
};
const manager = {
  agencyName: "Example agency",
  bio: "A local design preview for creator representation.",
  avatarUrl: null,
  websiteUrl: "https://example.test",
  country: "United Kingdom",
  languages: ["English"],
  contactEmail: "agency@example.test",
};
const creator = {
  id: "preview-creator",
  displayName: "Example creator",
  slug: "preview-creator",
  avatarUrl: null,
  customAvatarUrl: null,
  primaryPlatform: "twitch" as const,
  totalFollowers: "125000",
  totalViews: "350000",
  state: "claimed",
  bio: "A local preview of the creator settings layout.",
  country: "United Kingdom",
  language: "English",
  gender: null,
  age: null,
  interests: ["Gaming", "Music"],
  lastSnapshotAt: "2026-11-23T12:00:00Z",
  platformAccounts: [
    {
      platform: "twitch" as const,
      platformUsername: "examplecreator",
      followerCount: "125000",
      avatarUrl: null,
      isOAuthConnected: true,
    },
  ],
  growthRollups: [
    {
      platform: "twitch" as const,
      pct7d: 0.042,
      delta7d: "5040",
      trendDirection: "up",
    },
  ],
};
const roster = ["active", "pending", "expired"].map((inviteState, index) => ({
  accessId: `preview-access-${index}`,
  inviteState,
  inviteExpiresAt: "2026-11-28T12:00:00Z",
  creator: {
    ...creator,
    id: `preview-creator-${index}`,
    displayName: ["Example creator", "Invited creator", "Expired invitation"][
      index
    ]!,
    slug: `preview-creator-${index}`,
  },
}));
const fixtures: Record<string, unknown> = {
  "talentManager.getRoster": roster,
  "talentManager.getMyProfile": manager,
  "talentManager.searchCreators": [{ ...creator, isClaimed: true }],
  "talentManager.getCreatorAnalytics": [],
  "auth.me": user,
};

/** Development-only visual fixture. Its isolated RPC client never sends requests. */
export function WorkspaceSpecimen({
  initialView = "Roster",
  initialDrawer = false,
}: {
  initialView?: string;
  initialDrawer?: boolean;
}) {
  const [view, setView] = useState(initialView);
  const [drawer, setDrawer] = useState(initialDrawer);
  const [widgets, setWidgets] = useState(getDefaultWidgets());
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const [client] = useState(() =>
    trpc.createClient({
      links: [
        () =>
          ({ op }) =>
            observable((observer) => {
              if (op.type === "mutation") {
                observer.error(
                  new TRPCClientError("Preview only. No data was changed."),
                );
                return;
              }
              observer.next({ result: { data: fixtures[op.path] ?? [] } });
              observer.complete();
            }),
      ],
    }),
  );
  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div className="noticed n-workspace">
          <div className="border-b border-n-line bg-n-surface px-5 py-5">
            <p className="text-sm font-semibold">
              Development preview · Fictional data · All writes blocked
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "Roster",
                "Agency settings",
                "Creator settings",
                "Creator detail",
              ].map((label) => (
                <button
                  key={label}
                  className="n-button n-button-secondary"
                  aria-pressed={view === label}
                  onClick={() => setView(label)}
                >
                  {label}
                </button>
              ))}
              <button
                className="n-button n-button-primary"
                onClick={() => setDrawer(true)}
              >
                Customise profile
              </button>
            </div>
          </div>
          <WorkspaceShell
            role={view === "Creator settings" ? "creator" : "talent_manager"}
          >
            {view === "Roster" ? (
              <ManagerDashboard userId="preview-user" />
            ) : (
              <div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-8 lg:px-10">
                {view === "Agency settings" ? (
                  <ManagerSettingsForm
                    user={user}
                    profile={manager}
                    activeRosterCount={1}
                  />
                ) : view === "Creator settings" ? (
                  <ProfileSettingsForm
                    user={user}
                    profile={creator}
                    platformAccounts={creator.platformAccounts}
                    partnerships={[]}
                  />
                ) : (
                  <CreatorDetailView
                    creator={creator}
                    permissions={{
                      canViewAnalytics: false,
                      canEditProfile: false,
                      canExportData: true,
                      canManageBrands: false,
                    }}
                    grantedAt="2026-11-01T12:00:00Z"
                  />
                )}
              </div>
            )}
            <WidgetToggle
              open={drawer}
              onClose={() => setDrawer(false)}
              enabledWidgets={widgets}
              onConfigChange={setWidgets}
              profileSlug={creator.slug}
              publicDemographicsEnabled={false}
            />
          </WorkspaceShell>
        </div>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
