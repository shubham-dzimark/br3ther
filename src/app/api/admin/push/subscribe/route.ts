import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiAdmin } from "@/lib/auth";
import { pushAvailable } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Store (or remove) this browser's Web Push subscription. */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getApiAdmin();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!pushAvailable()) {
    return NextResponse.json({ error: "push is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null;

  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  // Endpoint is unique per browser, so re-subscribing updates rather than
  // stacking duplicate rows that would each fire a notification.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh, auth, adminUserId: user.id },
    create: { endpoint, p256dh, auth, adminUserId: user.id },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await getApiAdmin();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  await prisma.pushSubscription
    .delete({ where: { endpoint: body.endpoint } })
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}
