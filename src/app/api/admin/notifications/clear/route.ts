import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiAdmin } from "@/lib/auth";
import { kindWhere, parseKind, type NoticeKind } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Delete the notifications in one menu that have already been read.
 *
 * Only read ones: a "clear everything" button would let a stray click destroy
 * an alert nobody has seen, and the row is the only record that the event was
 * ever reported.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getApiAdmin();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { kind?: NoticeKind } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const kind: NoticeKind = parseKind(body.kind);
  const scope = kindWhere(kind);

  const { count } = await prisma.adminNotification.deleteMany({
    where: { readAt: { not: null }, ...scope },
  });

  const unread = await prisma.adminNotification.count({
    where: { readAt: null, ...scope },
  });

  return NextResponse.json({ ok: true, cleared: count, unread });
}
