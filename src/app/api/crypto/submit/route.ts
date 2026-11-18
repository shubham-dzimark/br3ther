import { prisma } from "@/lib/prisma";
import { checkReceiptAccess } from "@/lib/receipt";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { CRYPTO_KEY, getCryptoConfig, markPaid, METHOD_KEY_RE } from "@/lib/crypto-pay";
import { portalOrderId } from "@/lib/portal";

export const dynamic = "force-dynamic";

const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"];
const SCREENSHOT_MAX_BYTES = 10_000_000;

/** wp_send_json_success / wp_send_json_error, which the page script reads. */
const reply = (success: boolean, data: Record<string, unknown>, status: number) =>
  Response.json({ success, data }, { status });

/* Control characters, written as escapes. */
const CONTROL = /[\x00-\x1f\x7f]+/g;
const CONTROL_EXCEPT_NEWLINES = /[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]+/g;

/** sanitize_text_field: no tags, no control characters, no line breaks. */
const singleLine = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** sanitize_textarea_field: as above, but line breaks survive. */
const multiLine = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(CONTROL_EXCEPT_NEWLINES, " ")
    .trim()
    .slice(0, max);

/**
 * The customer's "Mark as paid" (the plugin's crypto_pay_submit AJAX handler),
 * forwarded to the portal server-to-server.
 *
 * Authorised by the order's receipt capability - the same token that opens the
 * payment page - where the plugin used the WooCommerce order key and a nonce.
 */
export async function POST(request: Request): Promise<Response> {
  // A form on our own page; a cross-site post is never legitimate.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return reply(false, { message: "Invalid request." }, 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(false, { message: "Invalid request." }, 400);
  }

  const orderNumber = singleLine(form.get("order"), 64);
  const token = String(form.get("t") ?? "");
  const [order, viewer] = await Promise.all([
    orderNumber ? prisma.order.findUnique({ where: { orderNumber } }) : null,
    getCurrentCustomer(),
  ]);

  const access = order
    ? checkReceiptAccess({
        orderCustomerId: order.customerId,
        orderEmail: order.email,
        receiptTokenHash: order.receiptTokenHash,
        viewerCustomerId: viewer?.id ?? null,
        viewerEmail: viewer?.email ?? null,
        token: token || null,
      })
    : "denied";

  if (!order || access === "denied" || order.paymentMethodKey !== CRYPTO_KEY) {
    return reply(false, { message: "Invalid order reference." }, 400);
  }
  if (order.status !== "AWAITING_PAYMENT") {
    return reply(false, { message: "This order can no longer be paid here." }, 409);
  }

  const method = singleLine(form.get("method_key"), 32);
  const rateUuid = singleLine(form.get("rate_uuid"), 64);
  const txnHash = singleLine(form.get("txn_hash"), 200);
  const notes = multiLine(form.get("customer_notes"), 2000);

  if (!method || !rateUuid || !txnHash) {
    return reply(false, { message: "Please choose a currency and enter the transaction ID." }, 400);
  }
  if (!METHOD_KEY_RE.test(method)) {
    return reply(false, { message: "Invalid payment method." }, 400);
  }

  const cfg = await getCryptoConfig();
  if (!cfg.active) {
    return reply(false, { message: "Crypto payment is not currently available. Please contact support." }, 400);
  }

  // Optional screenshot, passed straight through; the portal re-encodes it.
  const entry = form.get("screenshot");
  const screenshot = entry instanceof File && entry.size > 0 ? entry : null;
  if (screenshot) {
    if (!SCREENSHOT_TYPES.includes(screenshot.type)) {
      return reply(false, { message: "The screenshot must be a PNG, JPEG or WebP image." }, 400);
    }
    if (screenshot.size > SCREENSHOT_MAX_BYTES) {
      return reply(false, { message: "The screenshot is too large - 10 MB at most." }, 400);
    }
  }

  // No amount is sent: the portal recomputes it from the order, fee and rate.
  const res = await markPaid(
    cfg,
    {
      order_id: String(portalOrderId(order.orderNumber)),
      method_key: method,
      rate_uuid: rateUuid,
      txn_hash: txnHash,
      customer_notes: notes,
    },
    screenshot,
  );

  if (res.ok) {
    return reply(true, { message: "Payment submitted. We will review and proceed." }, 200);
  }

  // A stale rate: tell the page so it can reload with fresh ones.
  if (res.code === 409 && res.data?.code === "rate_expired") {
    return reply(
      false,
      {
        message:
          typeof res.data.error === "string"
            ? res.data.error
            : "The exchange rate has expired. Please refresh the page.",
        code: "rate_expired",
      },
      409,
    );
  }

  return reply(false, { message: res.error || "Could not submit payment." }, 400);
}
