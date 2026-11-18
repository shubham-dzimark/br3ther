import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { requireAdmin } from "@/lib/auth";
import { BACKUP_DIR } from "@/lib/backup";

export const dynamic = "force-dynamic";

/**
 * Download one archive.
 *
 * Master only. The file contains the whole customer database - emails, phone
 * numbers, addresses, order history and admin password hashes - so the
 * fulfilment roles must not reach it even though they can sign in.
 */
export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin.role !== "OWNER") {
    return new Response("Forbidden", { status: 403 });
  }

  const name = new URL(request.url).searchParams.get("name") ?? "";

  /*
   * Only ever a bare filename in the expected shape. Rejecting traversal by
   * pattern rather than by trusting path.join keeps ../../etc/passwd out.
   */
  if (!/^br3thr-backup-[0-9-]+\.tar\.gz$/.test(name)) {
    return new Response("Not found", { status: 404 });
  }

  const file = path.join(BACKUP_DIR, name);
  try {
    const s = await stat(file);
    const stream = Readable.toWeb(
      createReadStream(file),
    ) as unknown as ReadableStream;

    return new Response(stream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(s.size),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
