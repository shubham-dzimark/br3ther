import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { CHAT_RESUME_COOKIE, verifyResumeToken, siteUrl } from "@/lib/chat-email";

export const dynamic = "force-dynamic";

/**
 * "Continue the conversation" from a chat email.
 *
 * Only parks the (signed) thread id in a short-lived cookie and sends the
 * customer to the shop. The chat poll adopts it - but only if resolveThread
 * says this visitor may read that thread, so an account's conversation still
 * needs that account signed in. When it does, we send them to sign in first;
 * the cookie waits for them and the chat opens once they are in.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const base = siteUrl() || new URL(request.url).origin;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const ticketId = verifyResumeToken(token);
  if (!ticketId) return NextResponse.redirect(`${base}/`, 302);

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { customerId: true, email: true },
  });
  if (!ticket) return NextResponse.redirect(`${base}/`, 302);

  // Does an account own this thread (by column, or by a registered address)?
  const ownerId =
    ticket.customerId ??
    (ticket.email
      ? (
          await prisma.customer.findUnique({
            where: { email: ticket.email.trim().toLowerCase() },
            select: { id: true },
          })
        )?.id ?? null
      : null);

  const customer = await getCurrentCustomer();
  const mustSignIn = ownerId !== null && customer?.id !== ownerId;

  const res = NextResponse.redirect(`${base}${mustSignIn ? "/account/login?chat=1" : "/"}`, 302);
  res.cookies.set(CHAT_RESUME_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // an hour to sign in
  });
  return res;
}
