import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/customer-auth";
import {
  CLEAR_CHAT_COOKIE,
  CLEAR_CHAT_RESET,
  CHAT_COOKIE,
  CHAT_RESET_COOKIE,
  claimThread,
  resolveThread,
} from "@/lib/chat-thread";
import { CHAT_RESUME_COOKIE, CLEAR_CHAT_RESUME, verifyResumeToken } from "@/lib/chat-email";
import { markCustomerSeen } from "@/lib/chat-presence";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Messages in the visitor's own chat thread.
 *
 * The thread id is never accepted as a parameter, so this cannot be pointed at
 * someone else's conversation. It is also checked against who is signed in:
 * holding the cookie is not enough for a thread that belongs to an account,
 * because the cookie survives sign-out and browsers get shared.
 */
export async function GET(): Promise<Response> {
  const jar = await cookies();
  let cookieId = jar.get(CHAT_COOKIE)?.value;
  const justSignedOut = Boolean(jar.get(CHAT_RESET_COOKIE)?.value);
  const customer = await getCurrentCustomer();

  /*
   * Arrived from a "continue the conversation" email link. The link only names
   * a thread; it becomes this browser's thread only if resolveThread agrees
   * this visitor may read it. If not yet (an account thread, not signed in),
   * the cookie is left to wait for the sign-in.
   */
  let resumed = false;
  const resumeId = verifyResumeToken(jar.get(CHAT_RESUME_COOKIE)?.value);
  if (resumeId && !justSignedOut) {
    const trial = await resolveThread({
      cookieId: resumeId,
      customerId: customer?.id ?? null,
      customerEmail: customer?.email ?? null,
    });
    if (trial.ok) {
      cookieId = resumeId;
      resumed = true;
    }
  }

  /*
   * Someone has just signed out on this browser. Answer as a blank slate and
   * burn the marker, so the widget forgets its cached guest details exactly
   * once rather than on every poll.
   */
  if (justSignedOut) {
    const headers = new Headers(NO_STORE);
    headers.append("Set-Cookie", CLEAR_CHAT_COOKIE);
    headers.append("Set-Cookie", CLEAR_CHAT_RESET);
    return Response.json(
      { messages: [], identified: Boolean(customer), signedIn: Boolean(customer), cleared: true },
      { headers },
    );
  }

  const access = await resolveThread({
    cookieId,
    customerId: customer?.id ?? null,
    customerEmail: customer?.email ?? null,
  });

  if (!access.ok) {
    // A thread that is not theirs to read - stale after sign-out, or belonging
    // to whoever used this browser before. Drop the cookie so it stops coming
    // back, and answer as though there were no conversation at all.
    const headers: Record<string, string> = { ...NO_STORE };
    if (access.reason === "wrong_owner" || access.reason === "not_found") {
      headers["Set-Cookie"] = CLEAR_CHAT_COOKIE;
    }
    /*
     * `cleared` tells the widget the thread it was holding is not the current
     * visitor's, so it also wipes the guest name/email it cached in
     * localStorage. The cookie alone is not enough: those details are client
     * side and the server cannot reach them.
     */
    return Response.json(
      {
        messages: [],
        identified: Boolean(customer),
        signedIn: Boolean(customer),
        cleared: headers["Set-Cookie"] ? true : undefined,
      },
      { headers },
    );
  }

  // Stamp ownership the first time an identified visitor reads the thread, so
  // the rule becomes a plain column check from here on.
  if (access.claim && customer) await claimThread(access.ticketId, customer.id);

  // The customer has the shop open - staff replies can wait in the widget
  // instead of going to their inbox (see chat-presence.ts).
  markCustomerSeen(access.ticketId);

  const ticket = await prisma.ticket.findUnique({
    where: { id: access.ticketId },
    select: {
      reference: true,
      status: true,
      staffReadAt: true,
      escalatedAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        take: 100,
        select: { id: true, body: true, fromStaff: true, fromAi: true, createdAt: true, attachments: true },
      },
    },
  });

  if (!ticket) {
    return Response.json(
      { messages: [], identified: Boolean(customer), signedIn: Boolean(customer), cleared: true },
      { headers: { ...NO_STORE, "Set-Cookie": CLEAR_CHAT_COOKIE } },
    );
  }

  const headers = new Headers(NO_STORE);
  if (resumed) {
    // Same session cookie the chat sets when a thread starts, and the one-shot
    // resume marker is spent.
    headers.append(
      "Set-Cookie",
      `${CHAT_COOKIE}=${access.ticketId}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    );
    headers.append("Set-Cookie", CLEAR_CHAT_RESUME);
  }

  return Response.json(
    {
      reference: ticket.reference,
      status: ticket.status,
      identified: true,
      // Tells the widget to open itself: the customer clicked through from email.
      resumed: resumed || undefined,
      signedIn: Boolean(customer),
      // Drives the "you're talking to the assistant" line and hides the
      // "talk to a person" button once a person is already on it.
      escalated: Boolean(ticket.escalatedAt),
      // A customer message is "read" once staff opened the thread after it
      // arrived. Staff messages carry no tick - they are not ours to confirm.
      messages: ticket.messages.map((m) => ({
        ...m,
        read:
          !m.fromStaff &&
          Boolean(ticket.staffReadAt && ticket.staffReadAt >= m.createdAt),
      })),
    },
    { headers },
  );
}
