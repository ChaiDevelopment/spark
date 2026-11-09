// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ImageRejectedError, detectImageType, processProfileImage } from "@/server/images";
import { keyBelongsTo, photoKeys, stagingKey } from "@/server/r2";

async function jpegWithGps(width = 2400, height = 1800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 100, b: 130 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "SparkCam", Model: "Test" },
      IFD3: { GPSLatitudeRef: "S", GPSLatitude: "6/1 12/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "106/1 49/1 0/1" },
    })
    .toBuffer();
}

describe("image validation", () => {
  it("detects real formats by magic bytes", async () => {
    expect(detectImageType(await jpegWithGps(300, 300))).toBe("jpeg");
    const png = await sharp({ create: { width: 300, height: 300, channels: 4, background: "#fff" } }).png().toBuffer();
    expect(detectImageType(png)).toBe("png");
    const webp = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#fff" } }).webp().toBuffer();
    expect(detectImageType(webp)).toBe("webp");
  });

  it("rejects non-images disguised with an image name/type", async () => {
    const fake = Buffer.from("<script>alert(1)</script>".padEnd(64, " "));
    expect(detectImageType(fake)).toBeNull();
    await expect(processProfileImage(fake)).rejects.toBeInstanceOf(ImageRejectedError);
  });

  it("rejects tiny images", async () => {
    await expect(processProfileImage(await jpegWithGps(120, 120))).rejects.toThrow(/at least/);
  });

  it("rejects truncated / corrupt files", async () => {
    const buf = await jpegWithGps(800, 800);
    await expect(processProfileImage(buf.subarray(0, 200))).rejects.toBeInstanceOf(ImageRejectedError);
  });
});

describe("image processing", () => {
  it("strips EXIF/GPS, converts to WebP, and resizes main + thumbnail", async () => {
    const input = await jpegWithGps();
    const inMeta = await sharp(input).metadata();
    expect(inMeta.exif).toBeDefined(); // sanity: input carries GPS EXIF

    const out = await processProfileImage(input);
    const mainMeta = await sharp(out.main.data).metadata();
    const thumbMeta = await sharp(out.thumb.data).metadata();

    expect(mainMeta.format).toBe("webp");
    expect(mainMeta.exif).toBeUndefined();
    expect(mainMeta.xmp).toBeUndefined();
    expect(Math.max(out.main.width, out.main.height)).toBe(1600);
    expect(thumbMeta.format).toBe("webp");
    expect(thumbMeta.exif).toBeUndefined();
    expect([out.thumb.width, out.thumb.height]).toEqual([480, 600]);
    expect(out.main.data.byteLength).toBeLessThan(input.byteLength);
  });
});

describe("object keys", () => {
  const user = "6f1c2a52-7b0b-4c35-9d2e-3f5c1c8a9b10";
  it("scopes keys to the owner with random UUID names", () => {
    const { objectKey, thumbKey } = photoKeys(user);
    expect(objectKey).toMatch(new RegExp(`^profiles/${user}/[0-9a-f-]{36}\\.webp$`));
    expect(thumbKey).toMatch(/_thumb\.webp$/);
    expect(keyBelongsTo(objectKey, user)).toBe(true);
    expect(keyBelongsTo(stagingKey(user), user)).toBe(true);
    expect(keyBelongsTo(objectKey, "00000000-0000-4000-8000-000000000000")).toBe(false);
  });
  it("refuses path tricks in user ids", () => {
    expect(() => photoKeys("../../etc")).toThrow();
  });
});
