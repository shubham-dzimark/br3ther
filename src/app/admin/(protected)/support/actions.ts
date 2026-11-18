"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

import { requireCapability } from "@/lib/permissions";
import { purgeTicketsOlderThan } from "@/lib/support-cleanup";
import { emailStaffReplyIfAway } from "@/lib/chat-email";
import { saveChatUploads } from "@/lib/chat-files";
import type { TicketStatus } from "@/generated/prisma";

const STATUSES = ["OPEN", "PENDING", "RESOLVED", "CLOSED"];

export async function replyToTicket(fd: FormData): Promise<void> {
  const admin = await requireCapability("support");
  const ticketId = String(fd.get("ticketId") ?? "");
  const body = String(fd.get("body") ?? "").trim();
  const back = String(fd.get("back") ?? "tickets");

  // Attached or pasted screenshots (ReplyAttachments puts them in "images").
  const uploads = await saveChatUploads(
    fd.getAll("images").filter((v): v is File => typeof v !== "string"),
  );
  if (uploads.error) redirect(`/admin/support/${back}?ticket=${ticketId}&error=${uploads.error}`);
  if (!ticketId || (!body && uploads.names.length === 0)) {
    redirect(`/admin/support/${back}?ticket=${ticketId}`);
  }

  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId, body, fromStaff: true, authorId: admin.id, attachments: uploads.names },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "PENDING" },
    }),
  ]);

  // Customer has left the site: the reply goes to their inbox too, and they
  // can answer by email or click back into the chat. Not awaited - SMTP must
  // never hold up staff.
  void emailStaffReplyIfAway(ticketId, body, uploads.names);

  revalidatePath(`/admin/support/${back}`);
  redirect(`/admin/support/${back}?ticket=${ticketId}&saved=1`);
}

export async function setTicketStatus(fd: FormData): Promise<void> {
  await requireCapability("support");
  const ticketId = String(fd.get("ticketId") ?? "");
  const status = String(fd.get("status") ?? "");
  const back = String(fd.get("back") ?? "tickets");
  if (!ticketId || !STATUSES.includes(status)) {
    redirect(`/admin/support/${back}`);
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: status as TicketStatus },
  });

  revalidatePath(`/admin/support/${back}`);
  redirect(`/admin/support/${back}?ticket=${ticketId}&saved=1`);
}


/* ---------- Housekeeping ---------- */

/**
 * Delete one conversation.
 *
 * Messages go with it by cascade. Nothing else is touched: an order the ticket
 * referenced keeps existing, and so does the customer - a support thread is a
 * record of a conversation, not of a sale.
 */
export async function deleteTicket(fd: FormData): Promise<void> {
  await requireCapability("support");
  const ticketId = String(fd.get("ticketId") ?? "");
  const back = String(fd.get("back") ?? "tickets");
  if (!ticketId) redirect(`/admin/support/${back}`);

  await prisma.ticket.delete({ where: { id: ticketId } }).catch(() => undefined);

  revalidatePath(`/admin/support/${back}`);
  redirect(`/admin/support/${back}?purged=1&n=1`);
}

/**
 * Delete old conversations in bulk.
 *
 * Age is measured on updatedAt, not createdAt: a thread from March that someone
 * replied to yesterday is a live conversation, and deleting it because it
 * "started long ago" would lose an exchange still in progress.
 */
export async function purgeOldTickets(fd: FormData): Promise<void> {
  const me = await requireCapability("support");
  if (me.role !== "OWNER") redirect("/admin/support/tickets?error=forbidden");

  const days = Number.parseInt(String(fd.get("days") ?? ""), 10);
  const closedOnly = fd.get("closedOnly") === "on";
  if (!Number.isFinite(days) || days < 0) {
    redirect("/admin/support/tickets?error=days");
  }

  const removed = await purgeTicketsOlderThan({ days, closedOnly });

  revalidatePath("/admin/support/tickets");
  revalidatePath("/admin/support/inbox");
  redirect(`/admin/support/tickets?purged=1&n=${removed}`);
}

/**
 * Delete the conversations that are ticked.
 *
 * Unlike the age-based clear-out this takes exactly the ids given, so it will
 * happily delete an open thread - that is the point of choosing them by hand.
 */
export async function bulkDeleteTickets(fd: FormData): Promise<void> {
  await requireCapability("support");
  const back = String(fd.get("back") ?? "tickets");

  const ids = fd
    .getAll("ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  let removed = 0;
  if (ids.length) {
    // Scoped to the ids submitted and nothing else; messages cascade.
    const result = await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
    removed = result.count;
  }

  revalidatePath("/admin/support/tickets");
  revalidatePath("/admin/support/inbox");
  redirect(`/admin/support/${back}?purged=1&n=${removed}`);
}
