import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveUpload, storeUpload } from "@/lib/media";

export const dynamic = "force-dynamic";

/** Anything touching the library needs an admin session with content rights. */
async function guard() {
  const user = await getApiAdmin();
  if (!user || !can(user.role, "content")) return null;
  return user;
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  // Default stays images so every existing caller is unaffected.
  const kind = searchParams.get("kind") === "video" ? "video/" : "image/";

  const assets = await prisma.mediaAsset.findMany({
    where: {
      mimeType: { startsWith: kind },
      ...(q ? { filename: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, url: true, filename: true, alt: true, sizeBytes: true },
  });

  return NextResponse.json({ assets });
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  const uploaded: { url: string; filename: string }[] = [];
  let rejected = 0;

  for (const file of files) {
    if (file.size === 0) continue;
    // Decide from the file itself, not its reported type: a .webm whose type
    // arrives empty was being classed as an image and then rejected by the
    // image allowlist, which is why valid videos would not upload.
    const resolved = resolveUpload(file);
    if (!resolved) {
      rejected += 1;
      continue;
    }
    const stored = await storeUpload(file, resolved.kind, user.id);
    if (stored) uploaded.push({ url: stored.url, filename: stored.filename });
    else rejected += 1;
  }

  return NextResponse.json({ uploaded, rejected });
}
