import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runRecoverySweep } from "@/lib/abandoned-cart";

export const dynamic = "force-dynamic";

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Emails carts that have gone quiet. Driven by cron, same as the other jobs.
 *
 * Deliberately cheap to call often: the delay, the interval and the per-cart
 * counter decide what actually goes out, so running every 15 minutes sends no
 * more mail than running hourly - it just reacts sooner.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !tokenMatches(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runRecoverySweep();
  return NextResponse.json(result);
}
