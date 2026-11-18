import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { pollChatReplies } from "@/lib/chat-inbox";

export const dynamic = "force-dynamic";

/** Pulls customers' email replies into their live chat threads. Every 2 minutes. */
function tokenMatches(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.headers.get("x-cron-secret") ||
    "";
  if (!provided || !tokenMatches(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await pollChatReplies();
  if (!result.ok) console.error(`[chat-mail] ${result.error}`);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
