import { prisma } from "@twitchmetrics/database";
import {
  buildPublicUrl,
  deleteObject,
  presignPut,
} from "@/server/services/storage/r2";

/**
 * Avatar domain service. Knows the per-role rules:
 *
 *   talent_manager → writes TalentManagerProfile.avatarUrl
 *   creator/admin  → writes CreatorProfile.customAvatarUrl
 *
 * The R2 layer below knows nothing about roles or columns. This file is the
 * single bridge between user identity and storage.
 */

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const TYPE_TO_EXT: Record<(typeof AVATAR_ALLOWED_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type AllowedAvatarContentType = (typeof AVATAR_ALLOWED_TYPES)[number];

export function isAllowedAvatarContentType(
  value: string,
): value is AllowedAvatarContentType {
  return (AVATAR_ALLOWED_TYPES as readonly string[]).includes(value);
}

export function buildAvatarKey(
  userId: string,
  contentType: AllowedAvatarContentType,
): string {
  const ext = TYPE_TO_EXT[contentType];
  return `avatars/${userId}/${Date.now()}.${ext}`;
}

/**
 * Verify a key belongs to the given user. Defends commitAvatar against a
 * client that tries to commit some other user's path.
 */
export function isKeyOwnedBy(key: string, userId: string): boolean {
  return key.startsWith(`avatars/${userId}/`);
}

/**
 * Whether the calling user should see the edit affordance. Talent managers
 * always can. Creators (and admins) only when they have zero connected
 * platform accounts — otherwise the platform avatar is the canonical image.
 */
export async function canUserUploadAvatar(
  userId: string,
  role: string,
): Promise<boolean> {
  if (role === "talent_manager") return true;

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
    select: { id: true, _count: { select: { platformAccounts: true } } },
  });

  if (!profile) return true; // no profile yet → allow upload as a fallback
  return profile._count.platformAccounts === 0;
}

/**
 * Presign a PUT URL for the calling user. The key embeds the userId so the
 * client can't upload to someone else's prefix.
 */
export async function presignAvatarUpload(params: {
  userId: string;
  contentType: AllowedAvatarContentType;
  contentLength: number;
}): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  const key = buildAvatarKey(params.userId, params.contentType);
  const { uploadUrl } = await presignPut({
    key,
    contentType: params.contentType,
    contentLength: params.contentLength,
  });
  return { uploadUrl, key, publicUrl: buildPublicUrl(key) };
}

/**
 * Commit a successful upload — writes the public URL to the right column,
 * then deletes the previous R2 object (best-effort).
 */
export async function commitAvatar(params: {
  userId: string;
  role: string;
  key: string;
}): Promise<{ avatarUrl: string }> {
  const publicUrl = buildPublicUrl(params.key);

  let previousUrl: string | null = null;

  if (params.role === "talent_manager") {
    const existing = await prisma.talentManagerProfile.findUnique({
      where: { userId: params.userId },
      select: { avatarUrl: true },
    });
    previousUrl = existing?.avatarUrl ?? null;
    await prisma.talentManagerProfile.upsert({
      where: { userId: params.userId },
      create: { userId: params.userId, avatarUrl: publicUrl },
      update: { avatarUrl: publicUrl },
    });
  } else {
    const existing = await prisma.creatorProfile.findUnique({
      where: { userId: params.userId },
      select: { id: true, customAvatarUrl: true },
    });
    if (!existing) {
      throw new Error("Creator profile not found for avatar upload");
    }
    previousUrl = existing.customAvatarUrl;
    await prisma.creatorProfile.update({
      where: { id: existing.id },
      data: { customAvatarUrl: publicUrl },
    });
  }

  const previousKey =
    previousUrl && previousUrl !== publicUrl ? extractKey(previousUrl) : null;
  if (previousKey) {
    await safeDelete(previousKey);
  }

  return { avatarUrl: publicUrl };
}

/**
 * Clear the user's custom avatar and delete the R2 object.
 */
export async function removeAvatar(params: {
  userId: string;
  role: string;
}): Promise<void> {
  let previousUrl: string | null = null;

  if (params.role === "talent_manager") {
    const existing = await prisma.talentManagerProfile.findUnique({
      where: { userId: params.userId },
      select: { avatarUrl: true },
    });
    previousUrl = existing?.avatarUrl ?? null;
    if (previousUrl) {
      await prisma.talentManagerProfile.update({
        where: { userId: params.userId },
        data: { avatarUrl: null },
      });
    }
  } else {
    const existing = await prisma.creatorProfile.findUnique({
      where: { userId: params.userId },
      select: { id: true, customAvatarUrl: true },
    });
    previousUrl = existing?.customAvatarUrl ?? null;
    if (existing && previousUrl) {
      await prisma.creatorProfile.update({
        where: { id: existing.id },
        data: { customAvatarUrl: null },
      });
    }
  }

  const previousKey = extractKey(previousUrl);
  if (previousKey) {
    await safeDelete(previousKey);
  }
}

function extractKey(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  const base = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (base && publicUrl.startsWith(`${base}/`)) {
    return publicUrl.slice(base.length + 1);
  }
  return null;
}

async function safeDelete(key: string): Promise<void> {
  try {
    await deleteObject(key);
  } catch (error) {
    // Orphan an object rather than fail the user-facing op.
    console.error("[avatar] Failed to delete previous R2 object", {
      key,
      error,
    });
  }
}
