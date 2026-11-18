import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { optimizeImage } from "@/lib/image-optimize";

/** Uploads live in /public/uploads and are served by Apache, not Next. */
export const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export const IMAGE_MAX_BYTES = 12_000_000; // 12 MB
/*
 * A hero video needs real headroom - 5 MB rejected almost anything usable.
 * This is a ceiling, not a target: uploads are served straight from disk with
 * no transcoding, so the full size comes down every visitor's connection.
 */
export const VIDEO_MAX_BYTES = 64_000_000; // 64 MB

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
  "video/quicktime": ".mov",
  "video/x-matroska": ".mkv",
  "video/x-m4v": ".m4v",
  "video/mpeg": ".mpeg",
  "video/3gpp": ".3gp",
  "video/x-msvideo": ".avi",
  "video/x-ms-wmv": ".wmv",
};

/*
 * Browsers do not agree on the MIME type for the less common containers.
 * Chrome reports .webm correctly, Safari sends "" for several, and .mkv is
 * routinely mislabelled - which is why a perfectly valid .webm was being
 * rejected outright.
 *
 * The filename is only ever used to *look up* a type that is already on the
 * allowlist above. The stored name is still a random UUID plus the extension
 * that allowlist dictates, so "invoice.php" cannot ride in on its own name.
 */
const EXT_TO_TYPE: Record<string, string> = {
  webm: "video/webm",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  ogg: "video/ogg",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  "3gp": "video/3gpp",
  avi: "video/x-msvideo",
  wmv: "video/x-ms-wmv",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  ico: "image/x-icon",
};

/**
 * What this file actually is, and therefore which allowlist applies.
 *
 * Returns null when nothing on either allowlist matches - the caller treats
 * that as a rejection.
 */
export function resolveUpload(
  file: File,
): { kind: "image" | "video"; mimeType: string; ext: string } | null {
  const candidates = [file.type];
  const suffix = (file.name || "").split(".").pop()?.toLowerCase() ?? "";
  if (EXT_TO_TYPE[suffix]) candidates.push(EXT_TO_TYPE[suffix]);

  for (const type of candidates) {
    if (IMAGE_TYPES[type]) return { kind: "image", mimeType: type, ext: IMAGE_TYPES[type] };
    if (VIDEO_TYPES[type]) return { kind: "video", mimeType: type, ext: VIDEO_TYPES[type] };
  }
  return null;
}

export type StoredFile = { url: string; filename: string; mimeType: string; sizeBytes: number };

/**
 * Writes an uploaded file to disk and records it in the media library.
 * The extension comes from the sniffed MIME type, never the client-supplied
 * filename, so "invoice.php" can't be written with that extension.
 *
 * SVG is accepted but stored as-is; Apache serves /uploads with
 * X-Content-Type-Options and a restrictive CSP, so an SVG can't run script
 * against the site's origin.
 */
export async function storeUpload(
  file: File,
  kind: "image" | "video",
  uploadedBy?: string,
): Promise<StoredFile | null> {
  if (!file || file.size === 0) return null;

  const resolved = resolveUpload(file);
  // The caller says which picker it is; the file says what it really is. A
  // mismatch means the wrong thing was chosen, so reject rather than store a
  // video where an image is expected.
  if (!resolved || resolved.kind !== kind) return null;

  const limit = kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  if (file.size > limit) return null;

  // Images are stored as optimised WebP (see image-optimize.ts); videos as uploaded.
  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  let mimeType = resolved.mimeType;
  let ext = resolved.ext;
  if (kind === "image") {
    const optimized = await optimizeImage(bytes, mimeType);
    if (optimized.kind === "invalid") return null;
    if (optimized.kind === "converted") {
      bytes = optimized.bytes;
      mimeType = "image/webp";
      ext = ".webp";
    }
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), bytes);

  const url = `/uploads/${name}`;
  const original = (file.name || name).slice(0, 200);

  await prisma.mediaAsset.create({
    data: {
      url,
      filename: original,
      mimeType,
      sizeBytes: bytes.length,
      uploadedBy: uploadedBy ?? null,
    },
  });

  return { url, filename: original, mimeType, sizeBytes: bytes.length };
}

/** Removes the row and the file. Missing files are ignored. */
export async function deleteMediaAsset(id: string): Promise<void> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return;

  await prisma.mediaAsset.delete({ where: { id } });

  const filename = asset.url.replace(/^\/uploads\//, "");
  if (filename && !filename.includes("/") && !filename.includes("..")) {
    await unlink(path.join(UPLOAD_DIR, filename)).catch(() => undefined);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
