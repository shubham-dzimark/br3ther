import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getTimeZone, ymdhm } from "@/lib/timezone";

/**
 * Interac Pay Portal sync.
 *
 * Contract taken from the user's own plugin (interac-pay-portal-sync.php):
 *  - push is a POST of JSON with the token IN THE BODY
 *  - the portal calls back with { token, record_id, order_id, transfer_status }
 *  - transfer_status: 0 = still awaiting, 1 = received, 2 = rejected/reversed
 *  - the portal can also read a single order back
 *
 * Hardening added on top of that plugin, which had `permission_callback =>
 * __return_true` and compared an unset option with hash_equals():
 *  - a missing or short token refuses every request instead of allowing all
 *  - constant-time comparison in both directions
 *  - token accepted from the X-VT-Token header (body still works for the
 *    portal's existing format); the GET no longer needs it in the query string
 *  - optional HMAC signature so the portal can prove a push came from us
 *  - terminal orders are never dragged backwards
 *  - pushes are deduplicated and never block a customer request
 */

const MIN_TOKEN_LENGTH = 16;

/*
 * Placeholder only - shown as greyed-out example text in the settings form.
 * The real endpoint is your provider's and is stored in the database, never in
 * this repository, so the URL can't leak through source control or a backup of
 * the code.
 */
export const PORTAL_URL_PLACEHOLDER = "https://portal.example.com/api/sync";

export type PortalConfig = {
  enabled: boolean;
  url: string;
  token: string;
  signingSecret: string;
  /** True only when it is safe to actually talk to the portal. */
  usable: boolean;
  reason: string | null;
};

export async function getPortalConfig(): Promise<PortalConfig> {
  const s = await getSettings();
  const url = (s[SETTING_KEYS.portalUrl] ?? "").trim();
  const token = (s[SETTING_KEYS.portalToken] ?? "").trim();
  const signingSecret = (s[SETTING_KEYS.portalSigningSecret] ?? "").trim();
  const enabled = s[SETTING_KEYS.portalEnabled] === "1";

  let reason: string | null = null;
  if (!enabled) reason = "Sync is switched off.";
  else if (!/^https:\/\//i.test(url)) reason = "The portal URL must be https://.";
  else if (token.length < MIN_TOKEN_LENGTH) {
    reason = `The token must be at least ${MIN_TOKEN_LENGTH} characters.`;
  }

  return { enabled, url, token, signingSecret, usable: reason === null, reason };
}

/** Constant-time compare that refuses when no usable token is configured. */
export function tokenMatches(provided: string, expected: string): boolean {
  if (!provided || expected.length < MIN_TOKEN_LENGTH) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pull the token from the header the portal is told to use, or the body. */
export function readToken(
  request: Request,
  body?: Record<string, unknown>,
): string {
  const header =
    request.headers.get("x-vt-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (header) return header.trim();
  const fromBody = body?.token;
  return typeof fromBody === "string" ? fromBody.trim() : "";
}

const TERMINAL = new Set(["DELIVERED", "CANCELLED", "REFUNDED", "FAILED"]);
export function isTerminal(status: string): boolean {
  return TERMINAL.has(status);
}

/** transfer_status → our order status. 0 and 2 never confirm money. */
export function statusForTransfer(code: number): "PROCESSING" | "ON_HOLD" | null {
  // Exactly the WooCommerce plugin: 1 -> processing, anything else -> on-hold.
  // A rejected transfer is NOT cancelled automatically; staff decide.
  if (code === 1) return "PROCESSING";
  if (code === 0 || code === 2) return "ON_HOLD";
  return null;
}

/**
 * Exactly the seven fields the working WooCommerce plugin sends - no more.
 *
 * `order_id` is a NUMBER, not our order reference. The portal's own routes
 * validate it with is_numeric() and read it with intval(), so "NL-2026-0009"
 * arrived as 0 and the endpoint answered "Invalid payload". Extra keys
 * (order_number, order_currency, test) are not part of the contract and are
 * no longer sent.
 */
export type PortalPayload = {
  token: string;
  order_id: number;
  customer_name: string;
  customer_email: string;
  order_amount: string;
  order_status: string;
  order_date: string;
};

/**
 * The numeric id the portal knows an order by.
 *
 * Only the trailing digits, matching what the admin shows: "0009" and legacy
 * "NL-2026-0009" both give 9, so the portal's Order ID column reads the same
 * number as #0009 in the admin. Stripping every non-digit instead would fold
 * the year in and send 20260009, which matches nothing a human sees.
 */
export function portalOrderId(orderNumber: string): number {
  const tail = /(\d+)\s*$/.exec(orderNumber);
  return tail ? Number.parseInt(tail[1], 10) : 0;
}

/**
 * Our statuses expressed as WooCommerce ones, since the portal was built
 * against Woo. The mapping mirrors the plugin's own callback, which treats
 * transfer_status 1 as "processing" and everything else as "on-hold".
 */
export function wooStatus(status: string): string {
  switch (status) {
    case "AWAITING_PAYMENT":
      return "on-hold";
    case "ON_HOLD":
      return "on-hold";
    case "FAILED":
      return "failed";
    case "PAYMENT_RECEIVED":
    case "PROCESSING":
      return "processing";
    case "SHIPPED":
    case "DELIVERED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    case "REFUNDED":
      return "refunded";
    default:
      return status.toLowerCase();
  }
}

export async function buildPayload(
  orderId: string,
  token: string,
): Promise<PortalPayload | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  // Matched on the method key, not a display title a rename would break.
  if (!order || order.paymentMethodKey !== "emt") return null;

  return {
    token,
    order_id: portalOrderId(order.orderNumber),
    customer_name: order.shipName,
    customer_email: order.email,
    order_amount: (order.totalCents / 100).toFixed(2),
    order_status: wooStatus(order.status),
    order_date: ymdhm(order.createdAt, await getTimeZone()),
  };
}

function hashPayload(payload: PortalPayload): string {
  // Hash without the token so rotating it doesn't force a resend of everything.
  const { token: _ignored, ...rest } = payload;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

/** HMAC of the exact body, so the portal can verify the sender. */
export function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export type PushResult =
  | { ok: true; skipped: "disabled" | "not_emt" | "unchanged" }
  | { ok: true; pushed: true; status: number; response: string }
  | { ok: false; error: string };

export async function pushOrderToPortal(
  orderId: string,
  options: { force?: boolean } = {},
): Promise<PushResult> {
  const config = await getPortalConfig();
  if (!config.usable) return { ok: true, skipped: "disabled" };

  const payload = await buildPayload(orderId, config.token);
  if (!payload) return { ok: true, skipped: "not_emt" };

  const hash = hashPayload(payload);
  if (!options.force) {
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      select: { portalPayloadHash: true },
    });
    // Every admin "Update" click used to fire a push in the original plugin,
    // including no-op saves. Skip when nothing meaningful changed.
    if (existing?.portalPayloadHash === hash) {
      return { ok: true, skipped: "unchanged" };
    }
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-vt-token": config.token,
  };
  if (config.signingSecret) {
    headers["x-vt-signature"] = signBody(body, config.signingSecret);
  }

  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const text = (await res.text()).slice(0, 300);

    await prisma.order.update({
      where: { id: orderId },
      data: {
        portalSyncedAt: new Date(),
        portalPayloadHash: res.ok ? hash : null,
        portalStatus: res.ok ? `ok:${res.status}` : `error:${res.status}`,
      },
    });

    return res.ok
      ? { ok: true, pushed: true, status: res.status, response: text }
      : { ok: false, error: `Portal responded ${res.status}: ${text}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "request failed";
    await prisma.order
      .update({
        where: { id: orderId },
        data: { portalSyncedAt: new Date(), portalStatus: `error:${message.slice(0, 80)}` },
      })
      .catch(() => undefined);
    return { ok: false, error: message };
  }
}

/** Fire-and-forget: the customer must never wait on a third party. */
export function queuePortalPush(orderId: string): void {
  void pushOrderToPortal(orderId).catch(() => undefined);
}

/** Harmless connectivity probe for the settings screen. */
export async function sendTestRequest(): Promise<{
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}> {
  const config = await getPortalConfig();
  if (!config.usable) {
    return { ok: false, error: config.reason ?? "Sync is not configured." };
  }

  /*
   * Structurally identical to a real push, because the portal rejected the
   * previous shape outright ("Invalid payload"). The three values it was most
   * likely tripping on are now valid: a real status rather than "test", a
   * non-zero amount, and a deliverable-looking email domain.
   *
   * `test` is kept so a portal that understands it can discard the record.
   * A portal that ignores the flag will store an order plainly marked
   * TEST-0000 for $1.00, which is obvious to spot and easy to delete.
   */
  /*
   * The same seven fields a real order sends, so a passing test proves the
   * real contract rather than a stub.
   *
   * The portal rejects order_id 0 and a 0.00 amount outright, so the test has
   * to look like a real order. The id is deliberately far above any number
   * this shop will issue, so the record it creates cannot be mistaken for - or
   * collide with - a genuine order.
   */
  const payload = {
    token: config.token,
    order_id: 999999999,
    customer_name: "Connection test",
    customer_email: "test@example.com",
    order_amount: "1.00",
    order_status: "on-hold",
    order_date: ymdhm(new Date(), await getTimeZone()),
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-vt-token": config.token,
  };
  if (config.signingSecret) {
    headers["x-vt-signature"] = signBody(body, config.signingSecret);
  }

  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, status: res.status, body: (await res.text()).slice(0, 400) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request failed" };
  }
}
