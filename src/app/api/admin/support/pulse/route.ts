import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * A cheap "has anything changed?" signature for the support screens.
 *
 * Two counts and a timestamp rather than the threads themselves: the client
 * polls this every few seconds and only asks the server to re-render when the
 * number actually moves, so an idle inbox costs almost nothing.
 */
export async function GET(): Promise<NextResponse> {
  await requireCapability("support");

  const [messages, tickets, newest] = await Promise.all([
    prisma.ticketMessage.count(),
    prisma.ticket.count(),
    prisma.ticket.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  return NextResponse.json({
    sig: `${messages}:${tickets}:${newest?.updatedAt.getTime() ?? 0}`,
  });
}
