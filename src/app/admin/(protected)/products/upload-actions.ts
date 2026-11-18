"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { optimizeImage } from "@/lib/image-optimize";

import { requireCapability } from "@/lib/permissions";

/** Files land here and are served by Next straight out of /public. */
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const IMAGE_MAX_BYTES = 3_100_000; // 3.1 MB
const VIDEO_MAX_BYTES = 5_100_000; // 5.1 MB

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
  "video/x-ms-wmv": ".wmv",
};

/**
 * Writes one uploaded file to /public/uploads and returns its public path.
 * The extension comes from the sniffed MIME type, never the client-supplied
 * filename, so a file called "x.php" can't be written with that extension.
 */
async function storeFile(
  file: File,
  kind: "image" | "video",
): Promise<string | null> {
  if (!file || file.size === 0) return null;

  const allowed = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  const limit = kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;

  if (file.size > limit) return null;
  let ext = allowed[file.type];
  if (!ext) return null;

  // Photos are stored as optimised WebP (see image-optimize.ts); videos as uploaded.
  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  if (kind === "image") {
    const optimized = await optimizeImage(bytes, file.type);
    if (optimized.kind === "invalid") return null;
    if (optimized.kind === "converted") {
      bytes = optimized.bytes;
      ext = ".webp";
    }
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), bytes);
  return `/uploads/${name}`;
}

function back(productId: string, added: number, rejected: number): string {
  const qs = new URLSearchParams();
  if (added) qs.set("uploaded", String(added));
  if (rejected) qs.set("rejected", String(rejected));
  const s = qs.toString();
  return `/admin/products/${productId}${s ? `?${s}` : ""}`;
}

export async function uploadCoverPhoto(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const productId = String(fd.get("productId") ?? "");
  if (!productId) redirect("/admin/products");

  const file = fd.get("file");
  let added = 0;
  let rejected = 0;

  if (file instanceof File && file.size > 0) {
    const url = await storeFile(file, "image");
    if (url) {
      await prisma.product.update({
        where: { id: productId },
        data: { coverImageUrl: url },
      });
      added = 1;
    } else {
      rejected = 1;
    }
  }

  revalidatePath(`/admin/products/${productId}`);
  redirect(back(productId, added, rejected));
}

export async function uploadProductPhotos(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const productId = String(fd.get("productId") ?? "");
  if (!productId) redirect("/admin/products");

  const files = fd.getAll("files").filter((f): f is File => f instanceof File);
  let added = 0;
  let rejected = 0;

  for (const file of files) {
    if (file.size === 0) continue;
    const url = await storeFile(file, "image");
    if (!url) {
      rejected += 1;
      continue;
    }
    const count = await prisma.productImage.count({ where: { productId } });
    await prisma.productImage.create({
      data: { productId, url, sortOrder: count },
    });
    added += 1;
  }

  revalidatePath(`/admin/products/${productId}`);
  redirect(back(productId, added, rejected));
}

export async function uploadVideo(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const productId = String(fd.get("productId") ?? "");
  if (!productId) redirect("/admin/products");

  const file = fd.get("file");
  let added = 0;
  let rejected = 0;

  if (file instanceof File && file.size > 0) {
    const url = await storeFile(file, "video");
    if (url) {
      await prisma.product.update({
        where: { id: productId },
        data: { videoUrl: url },
      });
      added = 1;
    } else {
      rejected = 1;
    }
  }

  revalidatePath(`/admin/products/${productId}`);
  redirect(back(productId, added, rejected));
}

export async function uploadVariantImage(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const productId = String(fd.get("productId") ?? "");
  const variantId = String(fd.get("variantId") ?? "");
  const file = fd.get("file");

  if (productId && variantId && file instanceof File) {
    const url = await storeFile(file, "image");
    if (url) {
      await prisma.productVariant.update({
        where: { id: variantId },
        data: { imageUrl: url },
      });
    }
  }

  // Revalidate rather than redirect, so acting on one row doesn't scroll the
  // admin back to the top of the page.
  revalidatePath(`/admin/products/${productId}`);
}

export async function clearCoverPhoto(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const productId = String(fd.get("productId") ?? "");
  if (productId) {
    await prisma.product.update({
      where: { id: productId },
      data: { coverImageUrl: null },
    });
  }
  revalidatePath(`/admin/products/${productId}`);
}

export async function clearVideo(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const productId = String(fd.get("productId") ?? "");
  if (productId) {
    await prisma.product.update({
      where: { id: productId },
      data: { videoUrl: null },
    });
  }
  revalidatePath(`/admin/products/${productId}`);
}
