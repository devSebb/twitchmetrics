import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma, Prisma } from "@twitchmetrics/database";
import { getSession } from "@/server/auth-cache";
import { hashInviteToken } from "@/server/services/roster-invite";
import { RosterInviteActions } from "@/components/invite/RosterInviteActions";
import { getSafeImageSrc } from "@/lib/safeImage";

export const metadata: Metadata = {
  title: "Roster Invitation",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

const inviteLookupArgs = {
  include: {
    manager: {
      select: {
        id: true,
        name: true,
        image: true,
        suspended: true,
        talentManagerProfile: {
          select: { agencyName: true, bio: true },
        },
      },
    },
    creatorProfile: {
      select: {
        id: true,
        displayName: true,
        slug: true,
        avatarUrl: true,
        state: true,
        userId: true,
        totalFollowers: true,
        primaryPlatform: true,
      },
    },
  },
} satisfies Prisma.TalentManagerAccessDefaultArgs;

type InviteLookup = Prisma.TalentManagerAccessGetPayload<
  typeof inviteLookupArgs
>;

type TerminalKind =
  | "not_found"
  | "cancelled"
  | "declined"
  | "accepted"
  | "expired";

function TerminalCard({
  kind,
  managerName,
  creatorName,
  creatorSlug,
}: {
  kind: TerminalKind;
  managerName?: string;
  creatorName?: string;
  creatorSlug?: string;
}) {
  const messages: Record<TerminalKind, { title: string; body: string }> = {
    not_found: {
      title: "Invitation link invalid",
      body: "This link doesn't match any invitation. It may have been mistyped or replaced by a newer link.",
    },
    cancelled: {
      title: "Invitation cancelled",
      body: managerName
        ? `${managerName} cancelled this invitation. Reach out if you want to reconnect.`
        : "This invitation was cancelled by the manager.",
    },
    declined: {
      title: "Previously declined",
      body: "You declined this invitation earlier. If you've changed your mind, ask the manager to send a new one.",
    },
    accepted: {
      title: "Already accepted",
      body: "You've already accepted this invitation. It's active in your dashboard.",
    },
    expired: {
      title: "Invitation expired",
      body: managerName
        ? `This invitation has expired. Ask ${managerName} to send a new link.`
        : "This invitation has expired. Ask your manager to send a new link.",
    },
  };

  const msg = messages[kind];

  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
      <h1 className="text-2xl font-bold text-[#F2F3F5]">{msg.title}</h1>
      <p className="mt-2 text-sm text-[#DBDEE1]">{msg.body}</p>
      {kind === "accepted" && (
        <Link
          href="/dashboard/home"
          className="mt-4 inline-block rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
        >
          Go to dashboard
        </Link>
      )}
      {kind === "accepted" && creatorSlug && (
        <Link
          href={`/creator/${creatorSlug}`}
          className="mt-2 ml-2 inline-block rounded-lg border border-[#3F4147] bg-[#383A40] px-4 py-2.5 text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
        >
          {creatorName ? `View ${creatorName}` : "View profile"}
        </Link>
      )}
    </div>
  );
}

function PendingHeader({
  managerName,
  managerAvatarUrl,
  managerAgency,
  managerBio,
  creatorName,
  creatorSlug,
  creatorAvatarUrl,
}: {
  managerName: string;
  managerAvatarUrl: string | null;
  managerAgency: string | null;
  managerBio: string | null;
  creatorName: string;
  creatorSlug: string;
  creatorAvatarUrl: string | null;
}) {
  const managerAvatar = managerAvatarUrl
    ? getSafeImageSrc(managerAvatarUrl)
    : null;
  const creatorAvatar = creatorAvatarUrl
    ? getSafeImageSrc(creatorAvatarUrl)
    : null;

  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
      <div className="flex items-center gap-4">
        {managerAvatar ? (
          <Image
            src={managerAvatar}
            alt={managerName}
            width={56}
            height={56}
            className="rounded-full"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#383A40] text-xl font-bold text-[#F2F3F5]">
            {managerName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-[#949BA4]">
            Roster invitation
          </p>
          <h1 className="text-xl font-bold text-[#F2F3F5]">
            {managerName}{" "}
            <span className="font-normal text-[#DBDEE1]">
              would like to manage
            </span>{" "}
            {creatorName}
          </h1>
          {managerAgency && (
            <p className="text-xs text-[#949BA4]">{managerAgency}</p>
          )}
        </div>
      </div>

      {managerBio && (
        <p className="mt-3 text-sm italic text-[#DBDEE1]">
          &ldquo;{managerBio}&rdquo;
        </p>
      )}

      <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#3F4147] bg-[#1E1F22] p-3">
        {creatorAvatar ? (
          <Image
            src={creatorAvatar}
            alt={creatorName}
            width={36}
            height={36}
            className="rounded-full"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#383A40] text-sm font-bold text-[#F2F3F5]">
            {creatorName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#F2F3F5]">
            {creatorName}
          </p>
          <p className="text-xs text-[#949BA4]">/{creatorSlug}</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-[#949BA4]">
        Accepting grants {managerName} access to analytics and roster-gated data
        only. It does <span className="text-[#DBDEE1]">not</span> grant login,
        billing, password, or settings access to your account.
      </p>
    </div>
  );
}

function renderPendingBody({
  access,
  currentUserId,
  token,
}: {
  access: InviteLookup;
  currentUserId: string | null;
  token: string;
}) {
  const managerName = access.manager.name ?? "A talent manager";
  const creatorName = access.creatorProfile.displayName;
  const creatorSlug = access.creatorProfile.slug;
  const profileOwnerId = access.creatorProfile.userId;

  const header = (
    <PendingHeader
      managerName={managerName}
      managerAvatarUrl={access.manager.image}
      managerAgency={access.manager.talentManagerProfile?.agencyName ?? null}
      managerBio={access.manager.talentManagerProfile?.bio ?? null}
      creatorName={creatorName}
      creatorSlug={creatorSlug}
      creatorAvatarUrl={access.creatorProfile.avatarUrl}
    />
  );

  // Not signed in → sign up / sign in CTAs.
  if (!currentUserId) {
    const returnTo = `/invite/roster/${token}`;
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
          <p className="text-sm text-[#DBDEE1]">
            Sign in or create an account to respond to this invitation.
          </p>
          <div className="mt-4 flex gap-3">
            <Link
              href={`/register?returnTo=${encodeURIComponent(returnTo)}`}
              className="rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
            >
              Sign up
            </Link>
            <Link
              href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
              className="rounded-lg border border-[#3F4147] bg-[#383A40] px-4 py-2.5 text-sm font-semibold text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
            >
              Log in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Signed in as the manager who sent the invite — defense-in-depth.
  if (access.managerId === currentUserId) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
          <p className="text-sm text-[#fcd34d]">
            This is an invitation you sent. You can&apos;t accept your own
            invitation.
          </p>
        </div>
      </div>
    );
  }

  // Signed in but profile not yet claimed → claim CTA.
  if (profileOwnerId === null) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
          <h2 className="text-lg font-semibold text-[#F2F3F5]">
            Claim {creatorName} first
          </h2>
          <p className="mt-1 text-sm text-[#DBDEE1]">
            To accept this invitation, you need to claim the profile. We&apos;ll
            bring you back here after verification.
          </p>
          <Link
            href={`/claim?profile=${access.creatorProfileId}&rosterInvite=${token}`}
            className="mt-4 inline-block rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615]"
          >
            Claim profile
          </Link>
        </div>
      </div>
    );
  }

  // Signed in but the profile belongs to someone else.
  if (profileOwnerId !== currentUserId) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
          <p className="text-sm text-[#DBDEE1]">
            This invitation is for the owner of {creatorName}. Sign out and sign
            back in with the right account to respond.
          </p>
        </div>
      </div>
    );
  }

  // Signed in, profile owner, not the manager — show Accept / Decline.
  return (
    <div className="space-y-4">
      {header}
      <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
        <h2 className="text-lg font-semibold text-[#F2F3F5]">
          Accept this invitation?
        </h2>
        <p className="mt-1 text-sm text-[#DBDEE1]">
          {managerName} will be able to view analytics and roster-gated data for{" "}
          {creatorName}. You can remove their access at any time from your
          dashboard.
        </p>
        <div className="mt-4">
          <RosterInviteActions accessId={access.id} />
        </div>
      </div>
    </div>
  );
}

export default async function RosterInvitePage({ params }: PageProps) {
  const { token } = await params;
  const hash = hashInviteToken(token);

  // SSR lookup. Same shape as rosterInvite.getByToken — we read Prisma
  // directly because this is a Server Component.
  const access = await prisma.talentManagerAccess.findUnique({
    where: { inviteTokenHash: hash },
    ...inviteLookupArgs,
  });

  const session = await getSession();
  const currentUserId = session?.user?.id ?? null;

  const body = (() => {
    if (!access) return <TerminalCard kind="not_found" />;

    const managerName = access.manager.name ?? "A talent manager";
    const summary = {
      managerName,
      creatorName: access.creatorProfile.displayName,
      creatorSlug: access.creatorProfile.slug,
    };

    // Terminal-state priority: cancelled → declined → accepted → expired → pending.
    if (access.revokedAt !== null) {
      return <TerminalCard kind="cancelled" {...summary} />;
    }
    if (access.status === "declined") {
      return <TerminalCard kind="declined" {...summary} />;
    }
    if (access.status === "active") {
      return <TerminalCard kind="accepted" {...summary} />;
    }
    if (
      access.inviteExpiresAt !== null &&
      access.inviteExpiresAt.getTime() < Date.now()
    ) {
      return <TerminalCard kind="expired" {...summary} />;
    }

    return renderPendingBody({ access, currentUserId, token });
  })();

  return <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">{body}</div>;
}
