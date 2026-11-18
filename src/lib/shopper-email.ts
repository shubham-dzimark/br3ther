import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { unsubscribeToken, verifyUnsubscribe } from "@/lib/abandoned-cart";

/*
 * Newsletter signups feed the abandoned-cart reminders.
 *
 * The reminder sweep writes to Cart.email, which only checkout (and signing
 * in) used to fill. A visitor who joins the list from the popup, the footer
 * or the wheel and then leaves a basket was unreachable. Signing up now
 * remembers the address in a cookie and puts it on that visitor's open cart;
 * a cart they start later picks it up when it is created.
 *
 * Never overwrites an address already on the cart - the one typed at checkout
 * is the more recent and deliberate choice. Opt-outs are still honoured when
 * sending (isSuppressed), exactly as for checkout addresses.
 *
 * The cookie is `email|signature`, signed with the same per-address HMAC as
 * the unsubscribe links, so it cannot be edited to aim reminders at someone
 * else's inbox. It is only trusted while the newsletter signup still exists:
 * deleting a subscriber in the admin stops new carts picking the address up.
 * (Same approach as the NL shop.)
 */

export const SHOPPER_EMAIL_COOKIE = "nl_shopper_email";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Same name as CART_COOKIE in lib/cart.ts, which imports this file (so not imported back).
const CART_COOKIE = "nl_cart";

function clean(raw: string | null | undefined): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  return email && email.length <= 254 && EMAIL.test(email) ? email : null;
}

/**
 * Call after a newsletter signup. Only from a server action or route handler,
 * where cookies can be written. Never throws: a signup must not fail because
 * of this.
 */
export async function rememberShopperEmail(raw: string): Promise<void> {
  const email = clean(raw);
  if (!email) return;
  try {
    const store = await cookies();
    store.set(SHOPPER_EMAIL_COOKIE, `${email}|${await unsubscribeToken(email)}`, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      // As long as a reminder could still be useful to them.
      maxAge: 60 * 60 * 24 * 180,
    });

    const token = store.get(CART_COOKIE)?.value;
    if (!token) return;
    // Only an open cart with no address yet; signing up is not basket activity,
    // so the idle clock is left alone.
    await prisma.cart.updateMany({
      where: { token, email: null, status: { not: "CONVERTED" } },
      data: { email },
    });
  } catch (err) {
    console.error(`[shopper-email] ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * The address a visitor signed up with, if this browser has a valid, signed
 * cookie for it and the signup has not been deleted since.
 */
export async function knownShopperEmail(): Promise<string | null> {
  try {
    const raw = (await cookies()).get(SHOPPER_EMAIL_COOKIE)?.value ?? "";
    const cut = raw.lastIndexOf("|");
    if (cut < 1) return null;
    const email = clean(raw.slice(0, cut));
    if (!email || !(await verifyUnsubscribe(email, raw.slice(cut + 1)))) return null;
    const signup = await prisma.newsletterSubscriber.findUnique({ where: { email }, select: { id: true } });
    return signup ? email : null;
  } catch {
    return null;
  }
}
