import { NextResponse } from "next/server";
import { prisma } from "@twitchmetrics/database";
import { getSession } from "@/server/auth-cache";
import { resolveAvatar } from "@/lib/avatar";

/**
 * Session payload for the site header. Public pages render statically; the
 * header's auth controls hydrate from this endpoint instead of reading the
 * session during the server render (which would force every page dynamic).
 */
export async function GET() {
  const session = await getSession();
  const user = session?.user ?? null;

  if (!user?.id) {
    return NextResponse.json(
      { user: null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // Roster invites are only fetched for users who own a creator profile.
  // Cheap indexed count keyed on userId.
  const hasCreatorProfile =
    (await prisma.creatorProfile.count({ where: { userId: user.id } })) > 0;

  // Resolve canonical avatar — TMs use their uploaded avatar first; creators
  // use platform/default avatars first and custom uploads as the fallback.
  let image: string | null = user.image ?? null;
  if (user.role === "talent_manager") {
    const tm = await prisma.talentManagerProfile.findUnique({
      where: { userId: user.id },
      select: { avatarUrl: true },
    });
    image = resolveAvatar("talent_manager", {
      user: { image: user.image ?? null },
      manager: { avatarUrl: tm?.avatarUrl ?? null },
    });
  } else {
    const creator = await prisma.creatorProfile.findUnique({
      where: { userId: user.id },
      select: {
        avatarUrl: true,
        customAvatarUrl: true,
        platformAccounts: {
          select: { platformAvatarUrl: true },
        },
      },
    });
    image = resolveAvatar(user.role, {
      user: { image: user.image ?? null },
      creator,
    });
  }

  return NextResponse.json(
    {
      user: {
        name: user.name ?? null,
        role: user.role ?? "creator",
        image,
        hasCreatorProfile,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
