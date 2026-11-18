import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { handleSortlyWebhook, readSortlyConfig } from "@/lib/sortly/sync";

export const dynamic = "force-dynamic";

function sameToken(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sortly webhook (Created / Edited / Moved / Deleted). Sortly does not sign its
 * deliveries, so the URL carries a long random token set in the admin. The
 * payload is only used for the item ids: each item is re-read from Sortly's API
 * before anything changes here. Answers straight away and works afterwards, so
 * Sortly is never left waiting.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const cfg = await readSortlyConfig();
  if (!cfg.webhookToken || !token || !sameToken(token, cfg.webhookToken)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!cfg.enabled) return NextResponse.json({ ok: true, skipped: "disabled" });

  const raw = await request.text().catch(() => "");
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw.slice(0, 200_000)) : null;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  void handleSortlyWebhook(payload).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
