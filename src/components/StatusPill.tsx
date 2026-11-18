// WooCommerce wording and order, so staff see the same list on every shop.
const TONES: Record<string, { bg: string; text: string; label: string }> = {
  AWAITING_PAYMENT: { bg: "bg-amber-50", text: "text-amber-700", label: "Pending payment" },
  // Legacy "Paid" rows read as Processing, which is what WooCommerce calls a paid order.
  PAYMENT_RECEIVED: { bg: "bg-blue-50", text: "text-blue-700", label: "Processing" },
  PROCESSING: { bg: "bg-blue-50", text: "text-blue-700", label: "Processing" },
  ON_HOLD: { bg: "bg-orange-50", text: "text-orange-700", label: "On hold" },
  SHIPPED: { bg: "bg-sky-50", text: "text-sky-700", label: "Shipped" },
  DELIVERED: { bg: "bg-[#D5F0E7]", text: "text-[#0E7C66]", label: "Completed" },
  CANCELLED: { bg: "bg-rose-50", text: "text-rose-700", label: "Cancelled" },
  REFUNDED: { bg: "bg-purple-50", text: "text-purple-700", label: "Refunded" },
  FAILED: { bg: "bg-red-50", text: "text-red-700", label: "Failed" },
};

/** Status -> the WooCommerce-style label shown everywhere in the admin. */
export const ORDER_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(TONES).map(([key, tone]) => [key, tone.label]),
);

/*
 * Hover help, worded like WooCommerce's own status tooltips. On hold differs on
 * one point: here stock is taken when payment is confirmed, not when an order
 * goes on hold, so the text says what this shop actually does.
 */
export const ORDER_STATUS_HELP: Record<string, string> = {
  AWAITING_PAYMENT:
    "The order has been received, but no payment has been made. Pending payment orders are generally awaiting customer action.",
  ON_HOLD:
    "The order is awaiting payment confirmation. Confirm the payment to move it to Processing.",
  PROCESSING:
    "Payment has been received (paid), and the stock has been reduced. The order is awaiting fulfillment.",
  PAYMENT_RECEIVED:
    "Payment has been received (paid), and the stock has been reduced. The order is awaiting fulfillment.",
  SHIPPED: "Order fulfilled and complete.",
  DELIVERED: "Order fulfilled and complete.",
  CANCELLED: "Cancelled by an admin or the customer. Stock is increased, no further action required.",
  REFUNDED: "Refunded by an admin. No further action required.",
  FAILED: "Payment failed or was declined. Stock is increased if it had been reduced.",
};

export function StatusPill({ status }: { status: string }) {
  const tone = TONES[status] ?? {
    bg: "bg-slate-100",
    text: "text-slate-600",
    label: status.replace(/_/g, " ").toLowerCase(),
  };

  return (
    <span
      title={ORDER_STATUS_HELP[status]}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${tone.bg} ${tone.text}`}
    >
      {tone.label}
    </span>
  );
}
