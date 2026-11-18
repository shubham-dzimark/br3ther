import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/secret-compare";
import { revalidatePath } from "next/cache";
import { syncDealPricing } from "@/lib/deals";

export const dynamic = "force-dynamic";

/**
 * Deals start and end on a clock, so something has to notice when a window
 * opens or closes. Admin edits sync immediately; this catches the rest.
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

  const result = await syncDealPricing();
  if (result.applied > 0 || result.cleared > 0) revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, ...result });
}
