import {
  buildPublicUrl,
  deleteObject,
  presignPut,
} from "@/server/services/storage/r2";

export const BRAND_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const BRAND_LOGO_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const TYPE_TO_EXT: Record<(typeof BRAND_LOGO_ALLOWED_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type AllowedBrandLogoContentType =
  (typeof BRAND_LOGO_ALLOWED_TYPES)[number];

export function isAllowedBrandLogoContentType(
  value: string,
): value is AllowedBrandLogoContentType {
  return (BRAND_LOGO_ALLOWED_TYPES as readonly string[]).includes(value);
}

export function buildBrandLogoKey(
  userId: string,
  contentType: AllowedBrandLogoContentType,
): string {
  const ext = TYPE_TO_EXT[contentType];
  return `brand-logos/${userId}/${Date.now()}.${ext}`;
}

export function isBrandLogoKeyOwnedBy(key: string, userId: string): boolean {
  return key.startsWith(`brand-logos/${userId}/`);
}

export async function presignBrandLogoUpload(params: {
  userId: string;
  contentType: AllowedBrandLogoContentType;
  contentLength: number;
}): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  const key = buildBrandLogoKey(params.userId, params.contentType);
  const { uploadUrl } = await presignPut({
    key,
    contentType: params.contentType,
    contentLength: params.contentLength,
  });
  return { uploadUrl, key, publicUrl: buildPublicUrl(key) };
}

export function extractBrandLogoKey(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  const base = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (base && publicUrl.startsWith(`${base}/brand-logos/`)) {
    return publicUrl.slice(base.length + 1);
  }
  return null;
}

export async function deleteBrandLogo(publicUrl: string | null): Promise<void> {
  const key = extractBrandLogoKey(publicUrl);
  if (!key) return;

  try {
    await deleteObject(key);
  } catch (error) {
    console.error("[brand-logo] Failed to delete R2 object", {
      key,
      error,
    });
  }
}
