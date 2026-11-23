"use client";
import { AppearanceProvider } from "@/components/ui/Appearance";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import { EditorialCreatorHeader } from "./EditorialCreatorHeader";
import { Container, ActionLink } from "@/components/ui/Editorial";
import type { getPublicCreatorView } from "@/lib/public-creator-view";

export type PublicCreatorView = Awaited<
  ReturnType<typeof getPublicCreatorView>
>;

export function CreatorProfileLayout(view: PublicCreatorView) {
  return (
    <AppearanceProvider>
      <div className="noticed noticed-analytics">
        <EditorialCreatorHeader creator={view.headerData} />
        <DashboardGrid
          profile={view.profile}
          widgetConfig={view.profile.widgetConfig}
          isClaimed={view.isClaimed}
          isOwner={false}
          dataAvailability={view.dataAvailability}
          statsContext={view.statsContext}
        />
        <Container className="flex flex-wrap items-center justify-between gap-6 border-t border-n-line py-12">
          <p className="max-w-xl text-lg font-semibold">
            A concise introduction, ready to share.
          </p>
          <ActionLink href={`/creator/${view.profile.slug}/media-kit`}>
            View media kit
          </ActionLink>
        </Container>
      </div>
    </AppearanceProvider>
  );
}
