import "server-only";
import { giftCardRecipientText, parseGiftCardDetails } from "@/lib/gift-card-core";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getMoneyFormatter } from "@/lib/currency";
import { getCarriers, findCarrier, trackingUrl } from "@/lib/carriers";
import { orderNo } from "@/lib/order-display";
import { getMailConfig, sendMail, type MailConfig, type MailAttachment } from "@/lib/mail";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import {
  adminNewOrderEmail,
  orderPlacedEmail,
  paymentReceivedEmail,
  shippedEmail,
  orderCompleteEmail,
  welcomeCodeEmail,
  type OrderMailData,
} from "@/lib/mail-templates";
import { getTimeZone } from "@/lib/timezone";
import { receiptPath } from "@/lib/receipt";
import { getBarcodeConfig, barcodeImageUrl, type BarcodeFormat } from "@/lib/barcode";
import { CRYPTO_KEY, cryptoPayPath } from "@/lib/crypto-pay";
import { nextOrderCouponFor } from "@/lib/upsell-campaigns";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com"
).replace(/\/+$/, "");

/**
 * Gathers everything the order templates need in one query.
 *
 * Figures come from the stored order rather than being recomputed, so an
 * email always states what the customer was actually charged even if prices
 * or shipping rules have since changed.
 */
async function orderData(orderId: string, receiptToken?: string): Promise<
  | {
      d: OrderMailData;
      email: string;
      phone: string | null;
      orderId: string;
      trackingCarrier: string | null;
      trackingCode: string | null;
    }
  | null
> {
  const [order, settings, money, barcodeConfig, reward] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, include: { items: true } }),
    getSettings(),
    getMoneyFormatter(),
    getBarcodeConfig(),
    nextOrderCouponFor(orderId),
  ]);
  if (!order) return null;

  /*
   * Item codes come from the variants still on file rather than the order
   * snapshot: a code is a property of the product, and an order that predates
   * barcodes should still show them. Items whose variant is gone simply have
   * no code, which is why this is a lookup rather than a join.
   */
  const itemCodes = new Map<string, { code: string; format: BarcodeFormat }>();
  if (barcodeConfig.enabled && barcodeConfig.emailItems) {
    const variantIds = order.items
      .map((i) => i.variantId)
      .filter((id): id is string => Boolean(id));
    if (variantIds.length > 0) {
      const variants = await prisma.productVariant.findMany({
        where: { id: { in: variantIds }, barcode: { not: null } },
        select: { id: true, barcode: true, barcodeFormat: true },
      });
      for (const v of variants) {
        itemCodes.set(v.id, {
          code: v.barcode as string,
          format: (v.barcodeFormat as BarcodeFormat) ?? barcodeConfig.format,
        });
      }
    }
  }

  const cash = (c: number) => money.formatIn(c, order.currency);
  const digitalOnly = order.items.length > 0 && order.items.every((i) => i.isGiftCard);

  return {
    orderId: order.id,
    email: order.email,
    phone: order.phone,
    trackingCarrier: order.trackingCarrier,
    trackingCode: order.trackingCode,
    d: {
      storeName: settings[SETTING_KEYS.storeName] || "Br3thr",
      storeUrl: SITE_URL,
      nextOrderCoupon: reward
        ? {
            code: reward.code,
            offer: reward.type === "PERCENT" ? `${reward.value}% off your next order` : `${money.format(reward.value)} off your next order`,
            note: [
              reward.isActive ? null : "Ready to use once your payment is confirmed.",
              `Valid for ${reward.upsellOffer?.couponValidDays ?? 30} days${reward.isActive ? "" : " from then"}`,
              reward.minSubtotalCents > 0 ? `on orders over ${money.format(reward.minSubtotalCents)}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          }
        : null,
      /*
       * Present only once the order has a receipt token. A guest has no
       * account, so without this the "View your order" button sent them to a
       * sign-in wall they can never pass.
       */
      receiptUrl: receiptToken
        ? `${SITE_URL}${receiptPath(order.orderNumber, receiptToken)}`
        : undefined,
      orderLabel: orderNo(order.orderNumber),
      orderDate: new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: await getTimeZone(),
      }).format(order.createdAt),
      customerName: order.shipName,
      orderBarcodeUrl:
        barcodeConfig.enabled && barcodeConfig.inEmail
          ? barcodeImageUrl(order.orderNumber, "code128", { height: 8, scale: 3 })
          : null,
      lines: order.items.map((i) => {
        const hit = i.variantId ? itemCodes.get(i.variantId) : undefined;
        // A gift card line says who it is for, under its amount.
        const card = i.isGiftCard ? parseGiftCardDetails(i.giftCardDetails) : null;
        return {
          name: i.nameSnapshot,
          variant: card
            ? [i.variantSnapshot, giftCardRecipientText(card)].filter(Boolean).join(" · ")
            : i.variantSnapshot,
          quantity: i.quantity,
          lineTotal: cash(i.lineTotalCents),
          barcodeUrl: hit ? barcodeImageUrl(hit.code, hit.format, { height: 6, scale: 2 }) : null,
        };
      }),
      subtotal: cash(order.subtotalCents),
      discount: order.discountCents > 0 ? cash(order.discountCents) : null,
      couponCode: order.couponCode,
      shipping: order.shippingCents > 0 ? cash(order.shippingCents) : "Free",
      tax: order.taxCents > 0 ? cash(order.taxCents) : null,
      total: cash(order.totalCents),
      giftCards: order.giftCardCents > 0 ? cash(order.giftCardCents) : null,
      giftCardPaid: order.giftCardRedeemedCents > 0 ? cash(order.giftCardRedeemedCents) : null,
      digitalOnly: digitalOnly,
      address: digitalOnly
        ? [order.shipName, "Delivered by email"]
        : [
            order.shipName,
            order.shipLine1,
            ...(order.shipLine2 ? [order.shipLine2] : []),
            `${order.shipCity} ${order.shipRegion} ${order.shipPostalCode}`,
            order.shipCountry,
          ],
    },
  };
}


/**
 * The PDF invoice, when this is the email the shop attaches it to.
 *
 * Returns an empty list rather than throwing: a PDF that fails to build must
 * cost the attachment, never the email itself - the customer still needs to
 * know their order was paid.
 */
async function invoiceAttachment(
  config: MailConfig,
  stage: MailConfig["invoiceOn"],
  orderId: string,
): Promise<MailAttachment[]> {
  if (config.invoiceOn !== stage) return [];
  try {
    const pdf = await buildInvoicePdf(orderId);
    if (!pdf) return [];
    return [
      { filename: pdf.filename, content: pdf.buffer, contentType: "application/pdf" },
    ];
  } catch (err) {
    console.error(
      `[mail] invoice PDF failed for ${orderId}: ${err instanceof Error ? err.message : err}`,
    );
    return [];
  }
}

/**
 * Order confirmation to the customer, plus the admin copy.
 *
 * Both go out from one call because they share the same expensive lookup, and
 * both are awaited internally but the whole thing is fire-and-forget from
 * checkout - a refused SMTP login must never turn a placed order into an
 * error page for the buyer.
 */
export async function sendOrderPlacedEmails(
  orderId: string,
  receiptToken?: string,
  /** After a thank-you page upsell changed the order: the customer only, marked as updated. */
  opts: { updated?: boolean } = {},
): Promise<void> {
  const config = await getMailConfig();
  if (!config.enabled) return;

  const data = await orderData(orderId, receiptToken);
  if (!data) return;

  const settings = await getSettings();

  if (config.sendOrderPlaced) {
    /*
     * The e-Transfer details are the whole point of this email - an unpaid
     * order sits at AWAITING_PAYMENT until the customer sends the money, and
     * the confirmation page is the only other place these appear.
     */
    const recipient = settings[SETTING_KEYS.emtRecipientEmail]?.trim();
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { emtSecurityAnswer: true, paymentMethodKey: true, orderNumber: true },
    });

    /*
     * A crypto order has no transfer to describe: the coin, amount and wallet
     * are chosen on its payment page, so the email carries the way back there.
     */
    const cryptoPay =
      order?.paymentMethodKey === CRYPTO_KEY
        ? [
            `<strong>Complete your crypto payment</strong>`,
            `Choose a currency and send the exact amount shown on your payment page.`,
            receiptToken
              ? `<a href="${SITE_URL}${cryptoPayPath(order.orderNumber, receiptToken)}">Go to your payment page</a>`
              : "",
          ]
            .filter(Boolean)
            .join("<br>")
        : null;

    const pay = order?.paymentMethodKey === "giftcard"
      ? `<strong>Paid in full by gift card</strong> — there is nothing to send.`
      : cryptoPay !== null
      ? cryptoPay
      : recipient
      ? [
          `<strong>Send your e-Transfer to ${recipient}</strong>`,
          settings[SETTING_KEYS.emtRecipientName]?.trim()
            ? `Recipient name: ${settings[SETTING_KEYS.emtRecipientName]}`
            : "",
          order?.emtSecurityAnswer
            ? `Security answer: <strong>${order.emtSecurityAnswer}</strong>`
            : "",
          `Amount: <strong>${data.d.total}</strong>`,
          `Message: ${data.d.orderLabel}`,
        ]
          .filter(Boolean)
          .join("<br>")
      : "";

    const placed = orderPlacedEmail(data.d, pay);
    await sendMail(
      {
        to: data.email,
        ...placed,
        ...(opts.updated ? { subject: `Updated: ${placed.subject} (new total ${data.d.total})` } : {}),
        attachments: await invoiceAttachment(config, "placed", orderId),
      },
      config,
    );
  }

  if (!opts.updated && config.sendAdminNewOrder && config.adminRecipients.length) {
    await sendMail(
      {
        to: config.adminRecipients,
        ...adminNewOrderEmail(data.d, {
          adminUrl: `${SITE_URL}/admin/orders/${data.orderId}`,
          email: data.email,
          phone: data.phone,
        }),
      },
      config,
    );
  }
}

/** Sent when staff confirm the e-Transfer landed. */
export async function sendPaymentReceivedEmail(orderId: string): Promise<void> {
  const config = await getMailConfig();
  if (!config.enabled || !config.sendPaymentReceived) return;

  const data = await orderData(orderId);
  if (!data) return;

  await sendMail(
    {
      to: data.email,
      ...paymentReceivedEmail(data.d),
      attachments: await invoiceAttachment(config, "paid", orderId),
    },
    config,
  );
}

/** Sent when tracking is attached, whether by hand or by the CSV import. */
export async function sendShippedEmail(orderId: string): Promise<void> {
  const config = await getMailConfig();
  if (!config.enabled || !config.sendShipped) return;

  const data = await orderData(orderId);
  // Without a tracking code there is nothing to tell the customer that the
  // status change alone doesn't, so this stays quiet rather than sending a
  // shipping email with an empty tracking box.
  if (!data || !data.trackingCode) return;

  const carriers = await getCarriers(false);
  await sendMail(
    {
      to: data.email,
      ...shippedEmail(data.d, {
        carrier: findCarrier(carriers, data.trackingCarrier)?.name ?? "Courier",
        code: data.trackingCode,
        url: trackingUrl(carriers, data.trackingCarrier, data.trackingCode),
      }),
      attachments: await invoiceAttachment(config, "shipped", orderId),
    },
    config,
  );
}

/**
 * Sent when an order is marked delivered - what the admin calls complete.
 *
 * Only goes out when the shop has chosen to attach the invoice at this stage,
 * because otherwise it is a second "all done" message on top of the shipping
 * notice, saying nothing new.
 */
export async function sendOrderCompleteEmail(orderId: string): Promise<void> {
  const config = await getMailConfig();
  if (!config.enabled || config.invoiceOn !== "delivered") return;

  const data = await orderData(orderId);
  if (!data) return;

  await sendMail(
    {
      to: data.email,
      ...orderCompleteEmail(data.d),
      attachments: await invoiceAttachment(config, "delivered", orderId),
    },
    config,
  );
}

/** The popup / footer newsletter code, so it survives closing the tab. */
export async function sendWelcomeCodeEmail(
  to: string,
  code: string,
): Promise<void> {
  const config = await getMailConfig();
  if (!config.enabled || !config.sendWelcomeCode) return;

  const settings = await getSettings();
  const headline = [
    settings[SETTING_KEYS.promoPopupTitle]?.trim(),
    settings[SETTING_KEYS.promoPopupHighlight]?.trim(),
  ]
    .filter(Boolean)
    .join(" ");

  await sendMail(
    {
      to,
      ...welcomeCodeEmail({
        storeName: settings[SETTING_KEYS.storeName] || "Br3thr",
        storeUrl: SITE_URL,
        code,
        headline: headline || "Your welcome code",
        body:
          settings[SETTING_KEYS.promoPopupBody]?.trim() ||
          "Thanks for signing up. Here's your code — it's waiting at checkout.",
      }),
    },
    config,
  );
}

/** Fire-and-forget helper for paths a customer is waiting on. */
export function queueOrderMail(
  fn: (id: string, receiptToken?: string) => Promise<void>,
  orderId: string,
  receiptToken?: string,
): void {
  void fn(orderId, receiptToken).catch((err) => {
    console.error(`[mail] order ${orderId}: ${err instanceof Error ? err.message : err}`);
  });
}

export type { MailConfig };
