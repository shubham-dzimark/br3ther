import "server-only";
import { prisma } from "@/lib/prisma";

export const CHAT_COOKIE = "nl_chat";

/**
 * Who is allowed to read a chat thread.
 *
 * The bug this exists to prevent: the thread used to be identified by the
 * nl_chat cookie alone, and that cookie outlived sign-out by 30 days. On a
 * shared computer the next person opened the widget and read the previous
 * customer's conversation.
 *
 * A cookie proves possession of a browser, not identity. So a thread that
 * belongs to an account is now checked against who is actually signed in, and
 * possession of the cookie is only sufficient for genuine guest threads.
 */
export type ThreadAccess =
  | { ok: true; ticketId: string; claim: boolean }
  | { ok: false; reason: "none" | "not_found" | "wrong_owner" };

export async function resolveThread(opts: {
  cookieId: string | undefined;
  customerId: string | null;
  /** The signed-in account's own address, used to judge whether a guest
   *  thread on this browser actually belongs to them. */
  customerEmail?: string | null;
}): Promise<ThreadAccess> {
  if (!opts.cookieId) return { ok: false, reason: "none" };

  const ticket = await prisma.ticket.findUnique({
    where: { id: opts.cookieId },
    select: { id: true, customerId: true, email: true },
  });
  if (!ticket) return { ok: false, reason: "not_found" };

  // Owned by an account: only that account may read it, signed in right now.
  if (ticket.customerId) {
    return ticket.customerId === opts.customerId
      ? { ok: true, ticketId: ticket.id, claim: false }
      : { ok: false, reason: "wrong_owner" };
  }

  /*
   * No customerId, but the address on the thread belongs to a registered
   * account - so this is somebody's identifiable conversation even though the
   * column is empty. That is the case for every thread created before the
   * column existed, and for a guest who signed up afterwards.
   *
   * Checking the address as well as the column is what makes the rule hold for
   * data that predates it. Without this, an ownership check that reads
   * correctly still protects nothing that already exists.
   */
  if (ticket.email) {
    const account = await prisma.customer.findUnique({
      where: { email: ticket.email.trim().toLowerCase() },
      select: { id: true },
    });
    if (account) {
      return account.id === opts.customerId
        ? { ok: true, ticketId: ticket.id, claim: true }
        : { ok: false, reason: "wrong_owner" };
    }
  }

  /*
   * A guest thread on this browser.
   *
   * Nobody signed in: the cookie is the only identity there is, so it stands.
   */
  if (!opts.customerId) return { ok: true, ticketId: ticket.id, claim: false };

  /*
   * Somebody has since signed in. Whether this thread is theirs is decided by
   * the address on it, NOT by who happens to be holding the cookie.
   *
   * This used to hand any guest thread to whoever signed in next, on the
   * reasoning that a guest wishlist is merged the same way. That analogy was
   * wrong: a wishlist is a list of products, a conversation can contain an
   * order number, an address or a complaint. On a shared computer it meant a
   * stranger's chat became visible to - and permanently owned by - the next
   * person to log in.
   *
   * Matching addresses is the case where continuing genuinely is the same
   * person mid-conversation. Anything else starts a fresh thread.
   */
  const signedInEmail = opts.customerEmail?.trim().toLowerCase();
  const threadEmail = ticket.email?.trim().toLowerCase();
  if (signedInEmail && threadEmail && signedInEmail === threadEmail) {
    return { ok: true, ticketId: ticket.id, claim: true };
  }

  return { ok: false, reason: "wrong_owner" };
}

/** Stamp a thread with its owner, so the check above is a column read next time. */
export async function claimThread(ticketId: string, customerId: string): Promise<void> {
  await prisma.ticket.updateMany({
    where: { id: ticketId, customerId: null },
    data: { customerId },
  });
}

/** The Set-Cookie value that drops a stale or foreign thread cookie. */
export const CLEAR_CHAT_COOKIE = `${CHAT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/**
 * A one-shot marker set at sign-out.
 *
 * Signing out clears the thread cookie server-side, but the widget also caches
 * the guest's name and email in localStorage so a returning visitor is not
 * asked twice - and the server cannot reach localStorage. Without this the
 * cache survived, the "before we start" gate was skipped, and on a shared
 * computer the next person inherited the last one's details.
 *
 * The messages endpoint sees it once, tells the widget to wipe itself, and
 * expires it.
 */
export const CHAT_RESET_COOKIE = "nl_chat_reset";
export const SET_CHAT_RESET = `${CHAT_RESET_COOKIE}=1; Path=/; Max-Age=120; HttpOnly; Secure; SameSite=Lax`;
export const CLEAR_CHAT_RESET = `${CHAT_RESET_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
