import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiAdmin } from "@/lib/auth";
import { kindWhere, parseKind, type NoticeKind } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Mark one notification read, or all of them. */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getApiAdmin();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { id?: string; all?: boolean; kind?: NoticeKind } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // An empty body means "mark everything".
    body = { all: true };
  }

  // "Mark all read" in one menu must not silence the other one.
  const kind: NoticeKind = parseKind(body.kind);
  const scope = kindWhere(kind);

  if (body.id) {
    await prisma.adminNotification.updateMany({
      where: { id: body.id, readAt: null },
      data: { readAt: new Date() },
    });
  } else {
    await prisma.adminNotification.updateMany({
      where: { readAt: null, ...scope },
      data: { readAt: new Date() },
    });
  }

  const unread = await prisma.adminNotification.count({
    where: { readAt: null, ...scope },
  });
  return NextResponse.json({ ok: true, unread });
}
