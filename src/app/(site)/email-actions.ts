"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { CART_COOKIE } from "@/lib/cart";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Put the address typed at checkout on the shopper's cart.
 *
 * Nothing else ever wrote Cart.email, so the abandoned-cart sweep skipped every
 * guest basket as unreachable. Saved when the field is left rather than on
 * submit: someone who fills in their email and then walks away is exactly who
 * a reminder is for.
 *
 * Only the caller's own open cart is touched. It never creates a cart or a
 * cookie, and a converted cart belongs to its order, so it is left alone.
 * Opt-outs are honoured when sending, not here - see isSuppressed.
 */
export async function rememberCheckoutEmail(raw: string): Promise<boolean> {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL.test(email)) return false;

  const token = (await cookies()).get(CART_COOKIE)?.value;
  if (!token) return false;

  const cart = await prisma.cart.findUnique({
    where: { token },
    select: { id: true, status: true, email: true },
  });
  if (!cart || cart.status === "CONVERTED") return false;
  if (cart.email === email) return true;

  await prisma.cart.update({
    where: { id: cart.id },
    // Filling in checkout is activity, so the idle clock restarts.
    data: { email, lastActivityAt: new Date() },
  });
  return true;
}
