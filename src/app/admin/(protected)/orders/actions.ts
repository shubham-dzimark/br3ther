"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

import { requireCapability } from "@/lib/permissions";
import {
  confirmOrderPaid,
  isPaidStatus,
  reverseOrderPayment,
} from "@/lib/order-payment";
import { kickSortlySync } from "@/lib/sortly/outbox";
import { findCarrier, getCarriers } from "@/lib/carriers";
import { isTerminal, queuePortalPush } from "@/lib/portal";
// Crypto orders mirror every status change to the crypto pay portal.
import { queueCryptoSync } from "@/lib/crypto-pay";
import { queueOrderMail, sendShippedEmail, sendOrderCompleteEmail } from "@/lib/order-mail";
import type { OrderStatus } from "@/generated/prisma";

const STATUSES = [
  "AWAITING_PAYMENT",
  "PROCESSING",
  "ON_HOLD",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
  "FAILED",
] as const;

/**
 * Mark an e-Transfer as received. This is the manual step that stands in for a
 * payment gateway callback: staff check the bank inbox, then confirm here.
 * Stock is decremented at this point, not at checkout, so abandoned unpaid
 * orders never hold inventory hostage.
 */
export async function confirmEmtPayment(formData: FormData): Promise<void> {
  // Confirming payment awards points, pays the referrer and decrements stock.
  const admin = await requireCapability("order_payments");
  const id = String(formData.get("orderId") ?? "");
  if (!id) redirect("/admin/orders");

  const result = await confirmOrderPaid(id, {
    adminId: admin.id,
    emtSenderEmail: String(formData.get("emtSenderEmail") ?? ""),
    emtReference: String(formData.get("emtReference") ?? ""),
  });

  if (result.reason === "not_found") redirect("/admin/orders");
  if (result.reason === "already_confirmed") {
    redirect(`/admin/orders/${id}?error=already_confirmed`);
  }

  queuePortalPush(id);

  queueCryptoSync(id);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  redirect(`/admin/orders/${id}?saved=1`);
}

export async function updateOrderStatus(formData: FormData): Promise<void> {
  const id = String(formData.get("orderId") ?? "");
  const raw = String(formData.get("status") ?? "");
  if (!id || !(STATUSES as readonly string[]).includes(raw)) {
    await requireCapability("orders");
    redirect("/admin/orders");
  }
  await requireForStatus(raw, [id]);

  /*
   * Moving to a paid status from this dropdown must do everything the Confirm
   * payment button does - award points, pay the referrer, decrement stock.
   * Previously it only wrote the status, so customers marked paid this way
   * silently earned nothing.
   */
  if (isPaidStatus(raw)) {
    await confirmOrderPaid(id, { status: raw });
  } else {
    if (raw === "CANCELLED" || raw === "REFUNDED" || raw === "FAILED") {
      // Transition and reversal together, so a status can never change
      // without the stock and points that go with it.
      await reverseOrderPayment(id, raw);
    } else {
      await prisma.order.update({
        where: { id },
        data: { status: raw as OrderStatus },
      });
    }
  }

  if (raw === "DELIVERED") queueOrderMail(sendOrderCompleteEmail, id);

  // Deduplicated by payload hash, so a no-op save doesn't spam the portal.
  queuePortalPush(id);
  queueCryptoSync(id);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  redirect(`/admin/orders/${id}?saved=1`);
}

export async function saveOrderDetails(formData: FormData): Promise<void> {
  await requireCapability("orders");
  const id = String(formData.get("orderId") ?? "");
  if (!id) redirect("/admin/orders");

  await prisma.order.update({
    where: { id },
    data: {
      trackingCode: String(formData.get("trackingCode") ?? "").trim() || null,
      staffNote: String(formData.get("staffNote") ?? "").trim() || null,
    },
  });

  revalidatePath(`/admin/orders/${id}`);
  redirect(`/admin/orders/${id}?saved=1`);
}

/** Save or update shipment tracking, optionally marking the order shipped. */
export async function saveTracking(formData: FormData): Promise<void> {
  await requireCapability("orders");

  const id = String(formData.get("orderId") ?? "");
  if (!id) redirect("/admin/orders");

  const number = String(formData.get("trackingNumber") ?? "").trim();
  const carrierKey = String(formData.get("trackingCarrier") ?? "").trim();
  const carrier = findCarrier(await getCarriers(false), carrierKey);
  const shippedRaw = String(formData.get("shippedAt") ?? "").trim();
  const markShipped = formData.get("markShipped") === "on";

  /*
   * "Mark shipped" on an unpaid order confirms its payment by implication -
   * it stamps the confirmation, takes the stock and pays the rewards. That is
   * the money capability, and this action reached it without asking: adding
   * tracking was a way around the gate the status dropdown enforces.
   */
  if (markShipped) await requireForStatus("SHIPPED", [id]);

  if (!number) redirect(`/admin/orders/${id}?error=tracking`);
  if (!carrier) redirect(`/admin/orders/${id}?error=carrier`);

  // A date-only input is midday UTC so it can't slip a day either way.
  const shippedAt = /^\d{4}-\d{2}-\d{2}$/.test(shippedRaw)
    ? new Date(`${shippedRaw}T12:00:00.000Z`)
    : new Date();

  const order = await prisma.order.findUnique({
    where: { id },
    select: { status: true, paymentConfirmedAt: true },
  });
  if (!order) redirect("/admin/orders");

  await prisma.order.update({
    where: { id },
    data: {
      trackingCode: number,
      trackingCarrier: carrier.key,
      shippedAt,
    },
  });

  /*
   * Marking shipped goes through the shared confirmation so an order that was
   * never paid still gets its stock, points and referral handled exactly once -
   * the same guarantee the status dropdown has.
   */
  if (markShipped && order.status !== "SHIPPED" && !isTerminal(order.status)) {
    await confirmOrderPaid(id, { status: "SHIPPED" });
  }

  queuePortalPush(id);

  queueCryptoSync(id);

  // After the update, so the email reads the tracking that was just saved.
  queueOrderMail(sendShippedEmail, id);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/", "layout");
  redirect(`/admin/orders/${id}?saved=1`);
}

/** Clear tracking without touching the order's status. */
export async function clearTracking(formData: FormData): Promise<void> {
  await requireCapability("orders");
  const id = String(formData.get("orderId") ?? "");
  if (!id) redirect("/admin/orders");

  await prisma.order.update({
    where: { id },
    data: { trackingCode: null, trackingCarrier: null, shippedAt: null },
  });

  revalidatePath(`/admin/orders/${id}`);
  redirect(`/admin/orders/${id}?saved=1`);
}

function bulkIds(fd: FormData): string[] {
  return fd.getAll("ids").map((v) => String(v).trim()).filter(Boolean);
}

/**
 * Bulk status change.
 *
 * Deliberately limited to fulfilment states. Moving an order to
 * PAYMENT_RECEIVED has side effects - awarding points, paying a referral,
 * decrementing stock - which run through confirmOrderPaid() one order at a
 * time. Offering it here would fire all of that in bulk from a single click,
 * so payment confirmation stays a per-order action.
 */
const BULK_STATUSES = ["PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

/*
 * Statuses that move money or reverse it. Confirming payment awards points and
 * decrements stock; cancelling and refunding give them back. Fulfilment staff
 * move an order through processing/shipped/delivered and no further.
 */
const MONEY_STATUSES = ["CANCELLED", "REFUNDED", "FAILED"] as const;

/**
 * Assert the extra capability only when a transition actually touches money.
 *
 * Judged on the transition, not the target alone. PROCESSING, SHIPPED and
 * DELIVERED are all "paid" statuses, so testing the target by itself denied
 * the fulfilment desk the very thing its role exists to do. Moving an order
 * that has NOT been paid into one of those states is different - it confirms
 * payment by implication - so that still needs the money capability.
 */
async function requireForStatus(status: string, orderIds: string[]): Promise<void> {
  await requireCapability("orders");

  if ((MONEY_STATUSES as readonly string[]).includes(status)) {
    await requireCapability("order_payments");
    return;
  }

  if (isPaidStatus(status) && orderIds.length) {
    const unconfirmed = await prisma.order.count({
      where: { id: { in: orderIds }, paymentConfirmedAt: null },
    });
    if (unconfirmed > 0) await requireCapability("order_payments");
  }
}

export async function bulkSetOrderStatus(formData: FormData): Promise<void> {
  const ids = bulkIds(formData);
  const status = String(formData.get("status") ?? "");

  if (!(BULK_STATUSES as readonly string[]).includes(status)) {
    await requireCapability("orders");
    redirect("/admin/orders?bulk=badstatus");
  }
  await requireForStatus(status, ids);

  /*
   * One order at a time through the same routines a single change uses.
   * A bare updateMany wrote the status and nothing else, so bulk cancelling
   * left points spent and stock still decremented, and a bulk move to a paid
   * status awarded nobody anything - the two paths quietly disagreed.
   */
  for (const id of ids) {
    if (isPaidStatus(status)) {
      await confirmOrderPaid(id, { status });
    } else {
      if (status === "CANCELLED" || status === "REFUNDED" || status === "FAILED") {
        // Transition and reversal together, so a status can never change
        // without the stock and points that go with it.
        await reverseOrderPayment(id, status);
      } else {
        await prisma.order.update({
          where: { id },
          data: { status: status as (typeof BULK_STATUSES)[number] },
        });
      }
    }
    // Every status change reaches the crypto portal, bulk ones included.
    queueCryptoSync(id);
  }

  revalidatePath("/admin/orders");
  redirect(`/admin/orders?bulk=status&n=${ids.length}`);
}

export async function bulkMarkProcessing(fd: FormData): Promise<void> {
  fd.set("status", "PROCESSING");
  return bulkSetOrderStatus(fd);
}

export async function bulkMarkShipped(fd: FormData): Promise<void> {
  fd.set("status", "SHIPPED");
  return bulkSetOrderStatus(fd);
}

export async function bulkMarkDelivered(fd: FormData): Promise<void> {
  fd.set("status", "DELIVERED");
  return bulkSetOrderStatus(fd);
}

export async function bulkCancelOrders(fd: FormData): Promise<void> {
  fd.set("status", "CANCELLED");
  return bulkSetOrderStatus(fd);
}

/**
 * Bulk delete. Line items go with the order (cascade); tickets, referral
 * events and loyalty entries keep their nullable orderId and survive.
 *
 * Note this does NOT reverse anything a paid order already did - points stay
 * awarded, referral rewards stay paid, stock stays decremented. It is a tool
 * for clearing test data, not for undoing real sales, and the confirmation
 * says so.
 */
export async function bulkDeleteOrders(formData: FormData): Promise<void> {
  // Destructive and unrecoverable - not something a fulfilment login carries.
  await requireCapability("order_delete");
  const ids = bulkIds(formData);
  if (ids.length) await prisma.order.deleteMany({ where: { id: { in: ids } } });

  revalidatePath("/admin/orders");
  redirect(`/admin/orders?bulk=deleted&n=${ids.length}`);
}

/**
 * Status change from a row button on the order list.
 *
 * Same semantics as updateOrderStatus - paid statuses still go through
 * confirmOrderPaid so points, referral rewards and stock all move, and
 * cancel/refund still reverse them - but it returns to the list rather than
 * opening the order, because the whole point of the row buttons is to work
 * through a page of orders without leaving it. The current filter and search
 * are carried back so the row you just actioned doesn't vanish out from under
 * the next click.
 */
export async function setOrderStatusInline(formData: FormData): Promise<void> {
  const id = String(formData.get("orderId") ?? "");
  const raw = String(formData.get("status") ?? "");
  const back = String(formData.get("back") ?? "");
  // Only ever a query string we wrote ourselves; anything else is dropped so
  // this can't be turned into an open redirect.
  const query = back.startsWith("?") ? back : "";

  if (!id || !(STATUSES as readonly string[]).includes(raw)) {
    await requireCapability("orders");
    redirect(`/admin/orders${query}`);
  }
  // The dropdown reaches paid and cancelled too, so it takes the same gate.
  await requireForStatus(raw, [id]);

  if (isPaidStatus(raw)) {
    await confirmOrderPaid(id, { status: raw });
  } else {
    if (raw === "CANCELLED" || raw === "REFUNDED" || raw === "FAILED") {
      // Transition and reversal together, so a status can never change
      // without the stock and points that go with it.
      await reverseOrderPayment(id, raw);
    } else {
      await prisma.order.update({
        where: { id },
        data: { status: raw as OrderStatus },
      });
    }
  }

  // Marking an order delivered is what the admin calls "complete", so that is
  // where the invoice email hangs off.
  if (raw === "DELIVERED") queueOrderMail(sendOrderCompleteEmail, id);

  queuePortalPush(id);

  queueCryptoSync(id);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  redirect(`/admin/orders${query}`);
}

/**
 * Add a free gift line to an order from the admin.
 *
 * Priced at zero and flagged isGift, which is the same shape the automatic
 * gift rules produce - so the invoice, the packing slip and the customer's
 * order page all already know how to label it, and no total moves.
 *
 * Stock is decremented like any other line: a gift still leaves the shelf, and
 * not counting it is how a shop oversells.
 */
export async function addGiftItem(formData: FormData): Promise<void> {
  await requireCapability("orders");

  const orderId = String(formData.get("orderId") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  const qtyRaw = Number(String(formData.get("quantity") ?? "1"));
  const quantity = Number.isFinite(qtyRaw) ? Math.min(Math.max(Math.floor(qtyRaw), 1), 20) : 1;
  if (!orderId || !variantId) redirect(`/admin/orders/${orderId}?error=gift`);

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      manageStock: true,
      sortlyItemId: true,
      product: { select: { id: true, name: true } },
    },
  });
  if (!variant) redirect(`/admin/orders/${orderId}?error=gift`);
  const sendToSortly = variant.sortlyItemId !== null && variant.manageStock;

  await prisma.$transaction([
    prisma.orderItem.create({
      data: {
        orderId,
        productId: variant.product.id,
        variantId: variant.id,
        nameSnapshot: variant.product.name,
        variantSnapshot: variant.name,
        skuSnapshot: variant.sku,
        unitPriceCents: 0,
        quantity,
        lineTotalCents: 0,
        isGift: true,
      },
    }),
    prisma.productVariant.update({
      where: { id: variant.id },
      data: { stock: { decrement: quantity } },
    }),
    // A linked Sortly item loses the same units.
    ...(sendToSortly
      ? [prisma.sortlyStockChange.create({ data: { variantId: variant.id, delta: -quantity, reason: "gift added", orderId } })]
      : []),
  ]);
  if (sendToSortly) kickSortlySync([variant.id]);

  revalidatePath(`/admin/orders/${orderId}`);
  redirect(`/admin/orders/${orderId}?gift=added`);
}

/** Remove a gift line and put the stock back. */
export async function removeGiftItem(formData: FormData): Promise<void> {
  await requireCapability("orders");

  const orderId = String(formData.get("orderId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!orderId || !itemId) redirect(`/admin/orders/${orderId}`);

  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    select: { id: true, orderId: true, isGift: true, variantId: true, quantity: true },
  });

  // Only gift lines. A paid line carries money, and deleting one here would
  // leave the order's totals describing something the customer did not get.
  if (!item || item.orderId !== orderId || !item.isGift) {
    redirect(`/admin/orders/${orderId}?error=gift`);
  }

  const linked = item.variantId
    ? await prisma.productVariant.findUnique({
        where: { id: item.variantId },
        select: { manageStock: true, sortlyItemId: true },
      })
    : null;
  const sendToSortly = Boolean(item.variantId && linked && linked.sortlyItemId !== null && linked.manageStock);

  await prisma.$transaction([
    prisma.orderItem.delete({ where: { id: item.id } }),
    ...(item.variantId
      ? [
          prisma.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          }),
        ]
      : []),
    ...(sendToSortly && item.variantId
      ? [
          prisma.sortlyStockChange.create({
            data: { variantId: item.variantId, delta: item.quantity, reason: "gift removed", orderId },
          }),
        ]
      : []),
  ]);
  if (sendToSortly && item.variantId) kickSortlySync([item.variantId]);

  revalidatePath(`/admin/orders/${orderId}`);
  redirect(`/admin/orders/${orderId}?gift=removed`);
}
