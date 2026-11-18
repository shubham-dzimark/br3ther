/**
 * Gift card rules that need no database: the code format, how a typed code
 * is matched, how much a card may pay, and what a gift card line must carry.
 *
 * Kept free of server-only imports so it can be unit-tested directly and
 * shared by the cart, the checkout and the admin.
 */

/** No 0/O or 1/I - a code is read off an email and typed back in. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PREFIX = "GDFR";
const BODY_LENGTH = 8;

/** A fresh code, e.g. GDFR-7KQ2-M9XD. Uniqueness is the database's job. */
export function generateGiftCardCode(random?: () => number): string {
  let body = "";
  if (random) {
    for (let i = 0; i < BODY_LENGTH; i++) body += ALPHABET[Math.floor(random() * ALPHABET.length)];
  } else {
    const bytes = new Uint8Array(BODY_LENGTH);
    crypto.getRandomValues(bytes);
    // 32 symbols divide 256 evenly, so the modulo carries no bias.
    for (const b of bytes) body += ALPHABET[b % ALPHABET.length];
  }
  return formatGiftCardCode(PREFIX + body);
}

/** How a code is stored and looked up: upper case, no spaces or dashes. */
export function normalizeGiftCardCode(input: string): string {
  const flat = input.toUpperCase().replace(/[\s-]/g, "");
  return flat.length === BODY_LENGTH ? PREFIX + flat : flat;
}

/** GDFR7KQ2M9XD → GDFR-7KQ2-M9XD. */
export function formatGiftCardCode(normalized: string): string {
  const n = normalizeGiftCardCode(normalized);
  return `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8)}`;
}

/**
 * What a card pays on an order: its balance, capped at the part of the order
 * it is allowed to pay for (products, shipping and tax - never gift cards).
 */
export function giftCardRedeemable(args: { balanceCents: number; productDueCents: number }): number {
  return Math.max(0, Math.min(args.balanceCents, args.productDueCents));
}

export type GiftCardDetails = {
  deliverTo: "RECIPIENT" | "BUYER";
  recipientName: string;
  recipientEmail: string | null;
  senderName: string;
  message: string | null;
};

export const GIFT_CARD_MESSAGE_MAX = 300;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The details a gift card line carries, or null when they don't add up. */
export function parseGiftCardDetails(raw: unknown): GiftCardDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const deliverTo = r.deliverTo === "RECIPIENT" || r.deliverTo === "BUYER" ? r.deliverTo : null;
  const recipientName = str(r.recipientName).slice(0, 80);
  const senderName = str(r.senderName).slice(0, 80);
  const email = str(r.recipientEmail).toLowerCase();
  const message = str(r.message);

  if (!deliverTo || !recipientName || !senderName) return null;
  if (message.length > GIFT_CARD_MESSAGE_MAX) return null;
  if (deliverTo === "RECIPIENT" && !EMAIL.test(email)) return null;
  if (email && !EMAIL.test(email)) return null;

  return {
    deliverTo,
    recipientName,
    recipientEmail: email || null,
    senderName,
    message: message || null,
  };
}

/** The line under a gift card in the cart, checkout and emails. */
export function giftCardRecipientText(d: GiftCardDetails): string {
  return d.deliverTo === "RECIPIENT" && d.recipientEmail
    ? `To ${d.recipientName} · emailed to ${d.recipientEmail}`
    : `To ${d.recipientName} · sent to you to give in person`;
}

/**
 * The code being spent at checkout. Kept in an httpOnly cookie, never in the
 * URL: a code is money, and a URL ends up in browser history, server logs and
 * the analytics tags' page_location.
 */
export const GIFT_CARD_COOKIE = "nl_giftcard";
