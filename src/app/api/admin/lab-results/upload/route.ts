import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { getApiAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { UPLOAD_DIR } from "@/lib/media";
import { PDF_MAX_BYTES } from "@/lib/lab-results-data";

export const dynamic = "force-dynamic";

/**
 * One lab report PDF for the Lab Results page.
 *
 * Its own route rather than the media library's: that one only takes images and
 * video, and server actions cap a request at 8 MB, which a scanned certificate
 * easily passes. The file must start with the PDF signature - the name and the
 * reported type are never trusted - and is stored as <uuid>.pdf, the only form
 * the page will link to. Apache serves /uploads.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getApiAdmin();
  if (!user || !can(user.role, "content")) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a PDF file." }, { status: 400 });
  }
  if (file.size > PDF_MAX_BYTES) {
    return NextResponse.json({ error: "That PDF is over 20 MB." }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "That file is not a PDF." }, { status: 415 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}.pdf`;
  await writeFile(path.join(UPLOAD_DIR, name), bytes);

  const url = `/uploads/${name}`;
  const filename = (file.name || name).slice(0, 200);
  await prisma.mediaAsset.create({
    data: { url, filename, mimeType: "application/pdf", sizeBytes: file.size, uploadedBy: user.id },
  });

  return NextResponse.json({ url, filename });
}
