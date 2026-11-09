import "server-only";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serverEnv } from "@/lib/env.server";

/**
 * Cloudflare R2 (S3-compatible) access. The bucket is PRIVATE: every read and
 * write goes through short-lived presigned URLs minted here after the server
 * has authorized the request. Credentials never leave the server.
 */
let client: S3Client | undefined;

function r2(): S3Client {
  if (!serverEnv.r2AccessKeyId || !serverEnv.r2SecretAccessKey || !serverEnv.r2Bucket) {
    throw new Error("Cloudflare R2 is not configured (R2_* environment variables)");
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: serverEnv.r2Endpoint || `https://${serverEnv.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: serverEnv.r2AccessKeyId, secretAccessKey: serverEnv.r2SecretAccessKey },
    // R2 does not support the SDK's default CRC32 checksums on presigned PUTs.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

export const UPLOAD_URL_TTL_SECONDS = 300;
export const VIEW_URL_TTL_SECONDS = 600;

// ---------------------------------------------------------------- Object keys
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
/**
 * Presigned PUT. Content-Type and Content-Length are part of the signature,
 * so the browser cannot upload a different type or a larger file.
 */
export async function presignUpload(key: string, contentType: string, contentLength: number): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: serverEnv.r2Bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
  );
}

export async function presignView(key: string): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: serverEnv.r2Bucket, Key: key }), {
    expiresIn: VIEW_URL_TTL_SECONDS,
  });
}

// ---------------------------------------------------------------- Object I/O
export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: serverEnv.r2Bucket, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch {
    return null;
  }
}

export async function getObjectBytes(key: string, maxBytes: number): Promise<Buffer> {
  const res = await r2().send(new GetObjectCommand({ Bucket: serverEnv.r2Bucket, Key: key }));
  if ((res.ContentLength ?? 0) > maxBytes) throw new Error("object too large");
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error("empty object");
  if (bytes.byteLength > maxBytes) throw new Error("object too large");
  return Buffer.from(bytes);
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: serverEnv.r2Bucket,
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
    await r2().send(
      new DeleteObjectsCommand({
        Bucket: serverEnv.r2Bucket,
        Delete: { Objects: list.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}
