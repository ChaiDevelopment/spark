import "server-only";
import sharp from "sharp";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";

/**
 * Image processing pipeline for profile photos.
 *
 *  1. Validate the actual bytes (magic numbers), never the filename or the
 *     client-declared MIME type.
 *  2. Decode with pixel limits (decompression-bomb protection); reject
 *     animated or tiny images.
 *  3. Apply EXIF orientation, then re-encode. sharp drops ALL metadata
 *     (EXIF incl. GPS, XMP, IPTC) unless explicitly asked to keep it.
 *  4. Produce a main image (≤1600px, WebP) and a thumbnail (480×600 cover, WebP).
 *
 * New variants can be added here (e.g. AVIF, blur placeholders) by adding
 * columns/keys — `processing_version` on profile_photos tracks the pipeline.
 */
export const PROCESSING_VERSION = 1;
export const MAIN_MAX_DIMENSION = 1600;
export const THUMB_WIDTH = 480;
export const THUMB_HEIGHT = 600;
const MIN_DIMENSION = 200;
const MAX_INPUT_PIXELS = 40_000_000;

export type DetectedImageType = "jpeg" | "png" | "webp" | "avif";

export class ImageRejectedError extends Error {}

/** Identify the format from file signatures (magic bytes). */
export function detectImageType(buf: Buffer): DetectedImageType | null {
  if (buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
  }
  return null;
}

export interface ProcessedImage {
  sourceType: DetectedImageType;
  main: { data: Buffer; width: number; height: number };
  thumb: { data: Buffer; width: number; height: number };
}

export async function processProfileImage(input: Buffer): Promise<ProcessedImage> {
  if (input.byteLength === 0 || input.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageRejectedError("Images must be 10 MB or smaller.");
  }
  const sourceType = detectImageType(input);
  if (!sourceType) throw new ImageRejectedError("That file isn't a supported image (JPEG, PNG, WebP or AVIF).");

  const opts = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" as const, animated: false };
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(input, opts).metadata();
  } catch {
    throw new ImageRejectedError("We couldn't read that image. Try a different photo.");
  }
  if (!meta.width || !meta.height) throw new ImageRejectedError("We couldn't read that image.");
  if ((meta.pages ?? 1) > 1) throw new ImageRejectedError("Animated images aren't supported.");
  if (Math.min(meta.width, meta.height) < MIN_DIMENSION) {
    throw new ImageRejectedError(`Photos need to be at least ${MIN_DIMENSION}px on each side.`);
  }

  // .rotate() with no args applies and then discards EXIF orientation.
  const base = sharp(input, opts).rotate();
  const [main, thumb] = await Promise.all([
    base
      .clone()
      .resize({ width: MAIN_MAX_DIMENSION, height: MAIN_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer({ resolveWithObject: true }),
    base
      .clone()
      .resize({ width: THUMB_WIDTH, height: THUMB_HEIGHT, fit: "cover", position: sharp.strategy.attention })
      .webp({ quality: 74, effort: 4 })
      .toBuffer({ resolveWithObject: true }),
  ]);

  return {
    sourceType,
    main: { data: main.data, width: main.info.width, height: main.info.height },
    thumb: { data: thumb.data, width: thumb.info.width, height: thumb.info.height },
  };
}
