import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@twitchmetrics/database";
import { getSession } from "@/server/auth-cache";
import {
  getPublicCreator,
  getPublicCreatorView,
} from "@/lib/public-creator-view";
import { MediaKitLayout } from "@/components/media-kit/MediaKitLayout";
import { Container, ActionLink } from "@/components/ui/Editorial";

export const metadata: Metadata = {
  title: "Media Kit",
  robots: { index: false, follow: false },
};

export default async function MediaKitPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  const ownerProfile = await prisma.creatorProfile.findUnique({
    where: { userId: session.user.id },
    select: { slug: true, state: true },
  });
  if (
    !ownerProfile ||
    (ownerProfile.state !== "claimed" && ownerProfile.state !== "premium")
  )
    return (
      <div className="noticed rounded-xl p-6 sm:p-10">
        <h1 className="text-3xl font-extrabold tracking-tight">
          Your media kit.
        </h1>
        <p className="mt-4 text-n-slate">
          {ownerProfile
            ? "Your claim is pending. Your media kit will be available here once it is approved."
            : "Claim a creator profile to preview and share your media kit."}
        </p>
        {!ownerProfile && (
          <ActionLink href="/dashboard/claim" className="mt-6">
            Claim a profile
          </ActionLink>
        )}
      </div>
    );
  const profile = await getPublicCreator(ownerProfile.slug);
  if (!profile) notFound();
  const view = await getPublicCreatorView(profile);
  return (
    <div className="noticed overflow-hidden rounded-xl">
      <Container className="flex flex-wrap items-center justify-between gap-5 border-b border-n-line py-8">
        <div>
          <p className="n-eyebrow text-n-slate">Public preview</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight">
            Your media kit.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-n-slate">
            This preview uses the same public data and sharing settings as your
            public kit. Private account analytics are available in your
            dashboard.
          </p>
        </div>
        <ActionLink
          href={`/creator/${profile.slug}/media-kit`}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
        >
          Open public kit ↗
        </ActionLink>
      </Container>
      <MediaKitLayout {...view} />
    </div>
  );
}
