import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getApiAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  FONT_FORMATS,
  FONT_MAX_BYTES,
  sanitizeFamily,
  sniffFontFormat,
} from "@/lib/fonts";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "fonts");

/**
 * Font upload.
 *
 * A route handler rather than a server action so the browser can report real
 * upload progress, matching how product media is handled. The file is
 * identified by its magic bytes, never by the client's filename or its MIME
 * guess - .ttf and .otf arrive as application/octet-stream often enough that
 * checking file.type would reject valid fonts.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getApiAdmin();
  if (!user || !can(user.role, "settings")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const family = sanitizeFamily(String(form.get("family") ?? ""));
  const weight = Math.min(900, Math.max(100, Number(form.get("weight")) || 400));
  const style = String(form.get("style") ?? "normal") === "italic" ? "italic" : "normal";

  if (!family) {
    return NextResponse.json(
      { error: "Give the font a name — letters, numbers, spaces and hyphens." },
      { status: 400 },
    );
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a font file." }, { status: 400 });
  }
  if (file.size > FONT_MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1_000_000).toFixed(1)} MB; the limit is 3 MB.` },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFontFormat(bytes);
  if (!kind) {
    return NextResponse.json(
      { error: "That isn't a woff2, woff, ttf or otf font file." },
      { status: 400 },
    );
  }

  const { ext, format } = FONT_FORMATS[kind];
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), Buffer.from(bytes));
  const url = `/uploads/fonts/${name}`;

  /*
   * One file per weight+style in a family. Re-uploading the same slot
   * replaces it, so correcting a mistake doesn't leave two competing faces
   * that the browser would pick between unpredictably.
   */
  await prisma.customFont.upsert({
    where: { family_weight_style: { family, weight, style } },
    update: { url, filename: file.name.slice(0, 200), format, sizeBytes: file.size },
    create: {
      family,
      weight,
      style,
      url,
      filename: file.name.slice(0, 200),
      format,
      sizeBytes: file.size,
    },
  });

  revalidatePath("/admin/settings/fonts");
  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, family, weight, style, url });
}
