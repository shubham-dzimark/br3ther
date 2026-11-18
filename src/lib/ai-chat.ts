import "server-only";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notifications";
import { getAiConfig, aiReady, assistantReady, replyToThread, withinStaffHours } from "@/lib/ai-agent";
import { routeMessage } from "@/lib/chat-router";
import { replyToThreadVenice } from "@/lib/ai-venice";
import { getTimeZone } from "@/lib/timezone";

/**
 * Runs the assistant for one thread and writes what it says.
 *
 * Called after a customer message lands. Never throws: a failure here must
 * leave a normal support ticket waiting for a person, not an error in the
 * customer's chat window.
 */
export async function runAssistant(ticketId: string): Promise<void> {
  try {
    const config = await getAiConfig();
    if (!assistantReady(config)) return;

    // "Out of hours only": during staff hours the thread goes straight to a
    // person, which is what a shop with someone at the desk actually wants.
    // Judged in the store's own zone, not the code default - a shop that
    // changes its timezone should not silently keep Vancouver hours.
    if (config.offlineOnly && withinStaffHours(config, new Date(), await getTimeZone()))
      return;

    // The router is the free path and the default; Claude only runs when the
    // shop has chosen "ai" and supplied a key.
    const { reply, escalate } = !aiReady(config)
      ? await routeMessage(ticketId)
      : config.provider === "venice"
        ? await replyToThreadVenice(ticketId)
        : await replyToThread(ticketId);

    if (reply) {
      await prisma.ticketMessage.create({
        data: { ticketId, body: reply, fromStaff: true, fromAi: true },
      });
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date() },
      });
    }

    if (escalate) await escalateTicket(ticketId, escalate);
  } catch (err) {
    console.error("[ai] assistant run failed:", err);
    // Leave it for staff rather than retrying into a bill.
    await escalateTicket(ticketId, "The assistant could not answer.").catch(() => {});
  }
}

/**
 * Hand a thread to staff. Idempotent - the first reason sticks, so a thread
 * cannot be escalated repeatedly and spam the notification list.
 */
export async function escalateTicket(ticketId: string, reason: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { escalatedAt: true, reference: true, email: true, name: true },
  });
  if (!ticket || ticket.escalatedAt) return;

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      escalatedAt: new Date(),
      escalationNote: reason.slice(0, 300),
      status: "OPEN",
      updatedAt: new Date(),
    },
  });

  await prisma.ticketMessage.create({
    data: {
      ticketId,
      body: "I've passed this to a member of our team — they'll reply here shortly.",
      fromStaff: true,
      fromAi: true,
    },
  });

  await notifyAdmins({
    type: "SUPPORT_MESSAGE",
    title: "Live chat needs a person",
    body: `${ticket.name ?? ticket.email}: ${reason}`,
    href: "/admin/support/inbox",
  });
}

/** Staff taking a thread back from the assistant, or handing it over by hand. */
export async function setEscalated(
  ticketId: string,
  escalated: boolean,
): Promise<void> {
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      escalatedAt: escalated ? new Date() : null,
      escalationNote: escalated ? "Taken over by staff." : null,
    },
  });
}
