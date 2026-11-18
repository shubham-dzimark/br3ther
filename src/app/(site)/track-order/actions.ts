"use server";

import { clientIp } from "@/lib/client-ip";
import { getMoneyFormatter } from "@/lib/currency";
import { getCarriers, findCarrier, trackingUrl } from "@/lib/carriers";
import { getTranslator, type MessageKey } from "@/lib/i18n";
import { getTimeZone, ymd } from "@/lib/timezone";
import { allowTrackAttempt, findTrackableOrder, trackingSteps } from "@/lib/order-tracking";

export type TrackResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "found";
      orderNumber: string;
      statusLabel: string;
      notice: string | null;
      steps: { label: string; state: "done" | "current" | "todo"; date: string | null }[] | null;
      tracking: {
        carrierName: string | null;
        monogram: string | null;
        colour: string | null;
        code: string;
        url: string | null;
      } | null;
      items: { name: string; variant: string | null; quantity: number; gift: boolean }[];
      total: string;
      shipTo: string;
      placed: string;
    };

const STATUS_LABEL: Record<string, MessageKey> = {
  AWAITING_PAYMENT: "track.placed",
  ON_HOLD: "track.placed",
  PAYMENT_RECEIVED: "track.paid",
  PROCESSING: "track.processing",
  SHIPPED: "track.shipped",
  DELIVERED: "track.delivered",
};

/**
 * Look an order up by number and email. Everything needed for display is
 * worked out here, so the page receives plain text and nothing more than it
 * shows.
 */
export async function lookupOrder(_prev: TrackResult, fd: FormData): Promise<TrackResult> {
  const t = await getTranslator();
  const number = String(fd.get("orderNumber") ?? "");
  const email = String(fd.get("email") ?? "");

  if (!allowTrackAttempt((await clientIp()) ?? "unknown")) {
    return { status: "error", message: t("track.tooMany") };
  }

  const order = await findTrackableOrder(number, email);
  if (!order) return { status: "error", message: t("track.notFound") };

  const [money, carriers, tz] = await Promise.all([getMoneyFormatter(), getCarriers(false), getTimeZone()]);
  const steps = trackingSteps(order);
  const carrier = findCarrier(carriers, order.trackingCarrier);

  const notice =
    (order.status === "AWAITING_PAYMENT" || order.status === "ON_HOLD")
      ? t("track.awaitingPayment")
      : (order.status === "CANCELLED" || order.status === "FAILED")
        ? t("track.cancelled")
        : order.status === "REFUNDED"
          ? t("track.refunded")
          : null;

  return {
    status: "found",
    orderNumber: order.orderNumber,
    statusLabel:
      (order.status === "CANCELLED" || order.status === "FAILED")
        ? t("track.cancelled").replace(/\.$/, "")
        : order.status === "REFUNDED"
          ? t("track.refunded").replace(/\.$/, "")
          : t(STATUS_LABEL[order.status] ?? "track.placed"),
    notice,
    steps: steps
      ? steps.map((s) => ({
          label: t(`track.${s.key}` as MessageKey),
          state: s.state,
          date: s.at ? ymd(s.at, tz) : null,
        }))
      : null,
    tracking: order.trackingCode
      ? {
          carrierName: carrier?.name ?? order.trackingCarrier ?? null,
          monogram: carrier?.monogram ?? null,
          colour: carrier?.colour ?? null,
          code: order.trackingCode,
          url: trackingUrl(carriers, order.trackingCarrier, order.trackingCode),
        }
      : null,
    items: order.items.map((i) => ({
      name: i.nameSnapshot,
      variant: i.variantSnapshot,
      quantity: i.quantity,
      gift: i.isGift,
    })),
    total: money.formatIn(order.totalCents, order.currency),
    shipTo: [order.shipCity, order.shipRegion].filter(Boolean).join(", "),
    placed: ymd(order.createdAt, tz),
  };
}
