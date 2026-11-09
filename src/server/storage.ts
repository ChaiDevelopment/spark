import "server-only";
import { randomUUID } from "node:crypto";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serverEnv } from "@/lib/env.server";

/**
 * Private S3-compatible photo storage (Railway Storage Bucket, Cloudflare R2, …).
 *
 * Bytes are WRITTEN only by the server, after validation and re-encoding, so
 * the bucket needs no CORS rules and the browser never holds write access.
 * Reads go through short-lived presigned GET URLs minted after RLS has
 * authorized the viewer. Credentials never leave the server.
 */
let client: S3Client | undefined;

function s3(): S3Client {
  if (!serverEnv.storageEndpoint || !serverEnv.storageBucket || !serverEnv.storageAccessKeyId || !serverEnv.storageSecretAccessKey) {
    throw new Error("Photo storage is not configured (S3_* environment variables)");
  }
  client ??= new S3Client({
    region: serverEnv.storageRegion,
    endpoint: serverEnv.storageEndpoint,
    forcePathStyle: serverEnv.storageForcePathStyle,
    credentials: { accessKeyId: serverEnv.storageAccessKeyId, secretAccessKey: serverEnv.storageSecretAccessKey },
    // Several S3-compatible providers reject the SDK's default CRC32 checksums.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

export const VIEW_URL_TTL_SECONDS = 600;

// ---------------------------------------------------------------- Object keys
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Per-upload reservation key, stored in profile_photos.staging_key (unique,
 * scoped to the user by a DB constraint). Originals are processed in memory,
 * so no object is ever written under this key by the current pipeline.
 */
export function stagingKey(userId: string): string {
  if (!UUID_RE.test(userId)) throw new Error("invalid user id");
  return `uploads/${userId}/${randomUUID()}`;
}

/** Processed keys follow `profiles/{userId}/{randomUUID}.webp`. */
export function photoKeys(userId: string): { objectKey: string; thumbKey: string } {
  if (!UUID_RE.test(userId)) throw new Error("invalid user id");
  const id = randomUUID();
  return { objectKey: `profiles/${userId}/${id}.webp`, thumbKey: `profiles/${userId}/${id}_thumb.webp` };
}

export function keyBelongsTo(key: string, userId: string): boolean {
  return key.startsWith(`uploads/${userId}/`) || key.startsWith(`profiles/${userId}/`);
}

// ---------------------------------------------------------------- Presigning
export async function presignView(key: string): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: serverEnv.storageBucket, Key: key }), {
    expiresIn: VIEW_URL_TTL_SECONDS,
  });
}

// ---------------------------------------------------------------- Object I/O
export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: serverEnv.storageBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Keys are immutable (random UUID), so browsers may cache the bytes.
      CacheControl: "private, max-age=31536000, immutable",
    }),
  );
}

export async function deleteObjects(keys: (string | null | undefined)[]): Promise<void> {
  const list = keys.filter((k): k is string => Boolean(k));
  for (let i = 0; i < list.length; i += 1000) {
    await s3().send(
      new DeleteObjectsCommand({
        Bucket: serverEnv.storageBucket,
        Delete: { Objects: list.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}
