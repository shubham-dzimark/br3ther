import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { optimizeImage } from "@/lib/image-optimize";
import { getApiAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Product media upload as a route handler rather than a server action.
 *
 * Server actions give no upload progress - the browser can only report bytes
 * sent for an XHR it controls. The dropzone posts here with XHR so it can show
 * a real 0-100% bar instead of a spinner that says nothing about how long is
 * left on a 3 MB file.
 */

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const IMAGE_MAX_BYTES = 12_000_000;
/*
 * A hero video needs real headroom - 5 MB rejected almost anything usable.
 * This is a ceiling, not a target: the storefront serves uploads straight from
 * disk with no transcoding, so a 60 MB file is 60 MB down every visitor's
 * connection. The admin says so next to the field.
 */
const VIDEO_MAX_BYTES = 64_000_000;

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "image/heic": ".heic",
  "image/heif": ".heif",
  // For favicons. Browsers report .ico under either of these two types.
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

/*
 * SVG is deliberately absent. It can carry <script>, and uploads are served
 * from the site's own origin - so an SVG opened directly would run with the
 * session's privileges. PNG covers every case this shop needs.
 */
const VIDEO_TYPES: Record<string, string> = {
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
 * Some browsers report a bare or wrong MIME type for less common containers -
 * .webm and .mkv are the usual offenders, and Safari sends "" for a few. The
 * extension is only ever used as a fallback hint, and the value it maps to is
 * still one of the types above, so nothing outside the allowlist gets through.
 */
const EXT_FALLBACK: Record<string, string> = {
  webm: "video/webm",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  mp4: "video/mp4",
  "3gp": "video/3gpp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
};

/** Extension comes from the allowlist, never from the client filename. */
async function store(file: File, kind: "image" | "video"): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const allowed = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  const limit = kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  if (file.size > limit) return null;

  let type = file.type;
  if (!allowed[type]) {
    // Fall back to the filename's extension, but only to look up a type that
    // is itself on the allowlist - the stored name never comes from the client.
    const suffix = file.name.split(".").pop()?.toLowerCase() ?? "";
    type = EXT_FALLBACK[suffix] ?? type;
  }

  let ext = allowed[type];
  if (!ext) return null;

  // Photos are stored as optimised WebP (see image-optimize.ts); videos as uploaded.
  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  if (kind === "image") {
    const optimized = await optimizeImage(bytes, type);
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

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getApiAdmin();
  if (!user || !can(user.role, "catalog")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const productId = String(form.get("productId") ?? "");
  const kind = String(form.get("kind") ?? "");
  const variantId = String(form.get("variantId") ?? "");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    return NextResponse.json({ error: "product not found" }, { status: 404 });
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }

  let added = 0;
  let rejected = 0;

  if (kind === "video") {
    const url = await store(files[0], "video");
    if (url) {
      await prisma.product.update({ where: { id: productId }, data: { videoUrl: url } });
      added = 1;
    } else rejected = 1;
  } else if (kind === "cover") {
    const url = await store(files[0], "image");
    if (url) {
      await prisma.product.update({
        where: { id: productId },
        data: { coverImageUrl: url },
      });
      added = 1;
    } else rejected = 1;
  } else if (kind === "variant" && variantId) {
    const url = await store(files[0], "image");
    if (url) {
      await prisma.productVariant.update({
        where: { id: variantId },
        data: { imageUrl: url },
      });
      added = 1;
    } else rejected = 1;
  } else {
    // Gallery photos: keep going past a bad file rather than failing the batch.
    const last = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let sortOrder = (last?.sortOrder ?? -1) + 1;

    for (const file of files) {
      const url = await store(file, "image");
      if (!url) {
        rejected += 1;
        continue;
      }
      await prisma.productImage.create({
        data: { productId, url, sortOrder: sortOrder++ },
      });
      added += 1;
    }
  }

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/", "layout");

  return NextResponse.json({ added, rejected });
}
