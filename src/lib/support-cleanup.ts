import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

/**
 * Clearing out old support conversations.
 *
 * Chat threads are the fastest-growing table on a busy store - every "are you
 * there?" is a row - and unlike orders they have no value once they are old and
 * closed. This is the tool for keeping that under control.
 */

export type PurgeOptions = {
  /** Conversations untouched for this many days. 0 means everything. */
  days: number;
  /** Restrict to threads staff have finished with. */
  closedOnly: boolean;
};

function cutoffFor(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Age is measured on updatedAt, never createdAt. A thread opened in March and
 * replied to yesterday is a live conversation; deleting it because it started
 * long ago would throw away an exchange still in progress.
 */
export function purgeWhere(opts: PurgeOptions): Prisma.TicketWhereInput {
  return {
    updatedAt: { lt: cutoffFor(opts.days) },
    ...(opts.closedOnly ? { status: { in: ["RESOLVED", "CLOSED"] } } : {}),
  };
}

/** How many would go, so the button can say so before anything is deleted. */
export async function countPurgeable(opts: PurgeOptions): Promise<number> {
  return prisma.ticket.count({ where: purgeWhere(opts) });
}

export async function purgeTicketsOlderThan(opts: PurgeOptions): Promise<number> {
  // Messages cascade with the ticket; orders and customers are untouched.
  const { count } = await prisma.ticket.deleteMany({ where: purgeWhere(opts) });
  return count;
}

/*
 * There is deliberately no automatic retention here. Scheduled deletion of a
 * shop's own support history is the owner's call, and they chose to clear out
 * by hand - so the only way anything is deleted is someone pressing a button.
 */

/** Row and message counts, so the admin can see what it is actually holding. */
export async function supportFootprint(): Promise<{
  tickets: number;
  messages: number;
  closed: number;
}> {
  const [tickets, messages, closed] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticketMessage.count(),
    prisma.ticket.count({ where: { status: { in: ["RESOLVED", "CLOSED"] } } }),
  ]);
  return { tickets, messages, closed };
}
