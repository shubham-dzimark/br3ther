import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/secret-compare";
import { revalidatePath } from "next/cache";
import { runScheduledSync } from "@/lib/sortly/sync";

export const dynamic = "force-dynamic";

/**
 * Sortly stock sync, every 5 minutes from a systemd timer: Sortly's recent
 * changes plus anything the site has waiting (sales not yet sent, hand edits).
 * The webhook makes most updates instant; this is the safety net.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!secretMatches(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runScheduledSync();
  if ("synced" in result && (result.synced > 0 || result.linked > 0 || result.created > 0)) {
    revalidatePath("/", "layout");
  }
  return NextResponse.json({ ok: true, ...result });
}
