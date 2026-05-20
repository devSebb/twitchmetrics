import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 storage adapter.
 *
 * R2 is S3-compatible — we use the AWS SDK pointed at the R2 endpoint. All
 * domain-specific logic (avatars, media kits) lives in higher-level services;
 * this file is purely about keys, signed URLs, and public URLs.
 */

const PRESIGN_TTL_SECONDS = 5 * 60;

let cachedClient: S3Client | null = null;

function readEnv(): {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
} | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return null;
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

export function isStorageConfigured(): boolean {
  return readEnv() !== null;
}

function getClient(): {
  client: S3Client;
  bucket: string;
  publicUrl: string;
} {
  const env = readEnv();
  if (!env) {
    throw new Error(
      "R2 storage is not configured — missing one of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL.",
    );
  }

  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
    });
  }

  return {
    client: cachedClient,
    bucket: env.bucket,
    publicUrl: env.publicUrl.replace(/\/$/, ""),
  };
}

/**
 * Build a one-shot presigned PUT URL that the browser can upload to directly.
 * R2 enforces the signed `Content-Type` and `Content-Length` headers — clients
 * that lie about size or type will be rejected at upload time.
 */
export async function presignPut(params: {
  key: string;
  contentType: string;
  contentLength: number;
}): Promise<{ uploadUrl: string; expiresInSeconds: number }> {
  const { client, bucket } = getClient();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGN_TTL_SECONDS,
    signableHeaders: new Set(["content-type", "content-length"]),
  });

  return { uploadUrl, expiresInSeconds: PRESIGN_TTL_SECONDS };
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function buildPublicUrl(key: string): string {
  const { publicUrl } = getClient();
  return `${publicUrl}/${key}`;
}
