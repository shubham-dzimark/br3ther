import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

/*
 * Guest access to an order receipt.
 *
 * The receipt shows the shipping address and, while payment is outstanding,
 * the e-Transfer security answer. Order numbers are sequential ("0001",
 * "0002"), so the number alone can never be what authorises the page.
 *
 * Two ways in, and no third:
 *  - the signed-in customer the order belongs to;
 *  - a capability token issued when the order was placed.
 *
 * Anyone else is offered a recovery route - prove the email on the order and
 * a fresh link is sent there - rather than being shown the receipt.
 */

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Constant-time compare, so a wrong token cannot be narrowed by timing. */
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Issue (or reissue) a receipt token for an order.
 *
 * Reissuing replaces the old hash, so a link that has been forwarded on can be
 * revoked simply by asking for a new one.
 */
export async function issueReceiptToken(orderId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.order.update({
    where: { id: orderId },
    data: { receiptTokenHash: hash(token) },
  });
  return token;
}

/** The link a customer should be given for this order. */
export function receiptPath(orderNumber: string, token: string): string {
  return `/checkout/received/${encodeURIComponent(orderNumber)}?t=${encodeURIComponent(token)}`;
}

export type ReceiptAccess = "owner" | "token" | "denied";

/**
 * May this request see the receipt?
 *
 * Takes the stored hash rather than the order so callers cannot accidentally
 * pass a partially-loaded record and get a permissive answer.
 */
export function checkReceiptAccess(opts: {
  orderCustomerId: string | null;
  orderEmail: string;
  receiptTokenHash: string | null;
  viewerCustomerId: string | null;
  viewerEmail: string | null;
  token: string | null;
}): ReceiptAccess {
  const { orderCustomerId, orderEmail, receiptTokenHash, viewerCustomerId, viewerEmail, token } = opts;

  if (viewerCustomerId && orderCustomerId && viewerCustomerId === orderCustomerId) {
    return "owner";
  }
  /*
   * A guest order carries no customerId, so matching on email is the only way
   * a customer can reach their own pre-account purchases - the same rule the
   * order history list uses.
   *
   * Deliberately narrowed to orders that belong to nobody. Allowing an email
   * match against an order already owned by a different account meant one
   * customer could read another's receipt whenever the two shared an address
   * on file. The earlier comment claimed signing in proves mailbox ownership;
   * it does not - registration with a new address is not email-verified - so
   * this branch must never override an explicit owner.
   */
  if (
    viewerCustomerId &&
    !orderCustomerId &&
    viewerEmail &&
    orderEmail &&
    viewerEmail.toLowerCase() === orderEmail.toLowerCase()
  ) {
    return "owner";
  }
  if (token && receiptTokenHash && sameHash(hash(token), receiptTokenHash)) {
    return "token";
  }
  return "denied";
}
