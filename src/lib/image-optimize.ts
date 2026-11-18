import "server-only";
import sharp from "sharp";

/*
 * Every raster image uploaded in the admin is re-encoded here before it is
 * written to /uploads: turned upright (EXIF orientation), camera metadata and
 * GPS stripped, scaled down to at most 2000px on the longest side (never up),
 * and saved as WebP. A 2.4 MB phone JPEG typically lands at 150-400 KB.
 *
 * SVG (vector) and ICO (favicons) are kept exactly as uploaded. A file that
 * claims to be an image but cannot be decoded is refused rather than stored.
 */

/** Longest edge of a stored image. Product pages show them at most ~1000px wide, so this covers 2x screens. */
export const MAX_IMAGE_EDGE = 2000;
const WEBP_QUALITY = 80;

const CONVERTIBLE = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
]);

export type OptimizeResult =
  | { kind: "converted"; bytes: Buffer; width: number; height: number }
  /** Not a format we re-encode (SVG, ICO), or already a WebP that re-encoding would only make bigger. */
  | { kind: "unchanged" }
  /** Could not be decoded as an image. */
  | { kind: "invalid" };

export async function optimizeImage(input: Buffer, mimeType: string): Promise<OptimizeResult> {
  if (!CONVERTIBLE.has(mimeType)) return { kind: "unchanged" };

  // GIF and WebP can be animated; keep every frame.
  const animated = mimeType === "image/gif" || mimeType === "image/webp";
  try {
    let pipeline = sharp(input, { animated, failOn: "error", limitInputPixels: 120_000_000 });
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) return { kind: "invalid" };

    // Orientation comes from EXIF, which only still photos carry.
    if (!animated) pipeline = pipeline.rotate();

    const out = await pipeline
      .resize({
        width: MAX_IMAGE_EDGE,
        height: MAX_IMAGE_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY, effort: 5, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });

    // An already well-compressed WebP can come back larger; keep the original then.
    if (mimeType === "image/webp" && out.data.length >= input.length) return { kind: "unchanged" };

    return { kind: "converted", bytes: out.data, width: out.info.width, height: out.info.height };
  } catch {
    return { kind: "invalid" };
  }
}
