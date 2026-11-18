"use server";

import { redirect } from "next/navigation";
import { orderNo } from "@/lib/order-display";
import { prisma } from "@/lib/prisma";
import { issueReceiptToken, receiptPath } from "@/lib/receipt";
import { getMailConfig, sendMail } from "@/lib/mail";
import { escapeMailHtml, simpleEmail } from "@/lib/mail-templates";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { checkLoginGate, recordAttempt } from "@/lib/login-guard";

/**
 * Email a fresh receipt link to the address on the order.
 *
 * The response is identical whether or not the address matches, so this cannot
 * be used to discover which email addresses have ordered - the same reason the
 * password-reset form answers uniformly.
 *
 * Issuing a new token invalidates the previous one, so a link that has been
 * forwarded to someone else stops working as soon as the real customer asks
 * for another.
 */
export async function requestReceiptLink(fd: FormData): Promise<void> {
  const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(/\/$/, "");
  const orderNumber = String(fd.get("orderNumber") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const back = `/checkout/received/${encodeURIComponent(orderNumber)}`;

  if (!orderNumber || !email) redirect(`${back}?sent=1`);

  /*
   * Throttled per IP and per address on the same counter the sign-in gate
   * uses, so this cannot be turned into a mailbox flood or an address oracle.
   */
  const gate = await checkLoginGate({ kind: "CUSTOMER", email });
  if (gate.blocked) redirect(`${back}?sent=1`);
  await recordAttempt({
    kind: "CUSTOMER",
    email,
    success: false,
    reason: "receipt_link",
  });

  const order = await prisma.order.findFirst({
    where: { orderNumber, email },
    select: { id: true, orderNumber: true },
  });

  if (order) {
    const token = await issueReceiptToken(order.id);
    const [settings, mail] = await Promise.all([getSettings(), getMailConfig()]);
    const storeName = settings[SETTING_KEYS.storeName] || "Br3thr";
    const url = `${SITE_URL}${receiptPath(order.orderNumber, token)}`;

    await sendMail(
      {
        to: email,
        subject: `Your receipt for order ${orderNo(order.orderNumber)}`,
        html: simpleEmail({
          storeName,
          storeUrl: SITE_URL,
          heading: `Your receipt for order ${orderNo(order.orderNumber)}`,
          preheader: "Your receipt link is inside.",
          paragraphs: [
            `Here is the link to your ${escapeMailHtml(storeName)} receipt for order <strong>${escapeMailHtml(order.orderNumber)}</strong>.`,
          ],
          action: { href: url, label: "View your receipt" },
          note: "Anyone with this link can see the receipt, so please keep it to yourself. Asking for a new link replaces this one.",
        }),
        text: `Your ${storeName} receipt for order ${orderNo(order.orderNumber)}:\n${url}\n\nAnyone with this link can see the receipt. Asking for a new link replaces this one.`,
      },
      mail,
    ).catch(() => undefined);
  }

  redirect(`${back}?sent=1`);
}
