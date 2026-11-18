import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getTimeZone } from "@/lib/timezone";
import { portalOrderId, wooStatus } from "@/lib/portal";

/**
 * Crypto Payment gateway - a port of the user's "crypto-pay" WooCommerce plugin.
 *
 * The shop never holds wallets, rates or fees. A separate Crypto Pay Portal
 * owns those and computes every payable amount; this module is the
 * server-to-server client for it (class-crypto-api-client.php) plus the
 * settings and shared helpers the gateway, payment page, image proxy and
 * portal callbacks use.
 *
 * As in the plugin, the customer's browser never talks to the portal and never
 * sees its URL or keys: logos, QR codes and "mark as paid" all go through our
 * own routes.
 */

export const CRYPTO_KEY = "crypto";

/*
 * Placeholder only, shown greyed out in the settings form. The real portal
 * address is stored in the database, never in this repository - the same rule
 * as the e-Transfer Pay Portal.
 */
export const CRYPTO_ENDPOINT_PLACEHOLDER = "https://crypto-portal.example.com";

/** The shape the portal accepts for a method key; it owns the actual list. */
export const METHOD_KEY_RE = /^[a-z0-9_]{1,32}$/;

export const CRYPTO_CURRENCIES = ["CAD", "USD"] as const;
export type CryptoCurrency = (typeof CRYPTO_CURRENCIES)[number];
export type CryptoMode = "test" | "live";

/** The plugin's payment page reloads itself on this cycle to keep rates fresh. */
export const RATE_REFRESH_SECONDS = 30 * 60;

export type CryptoConfig = {
  endpointUrl: string;
  staticKey: string;
  siteKey: string;
  currency: CryptoCurrency;
  mode: CryptoMode;
  title: string;
  /** Sanitised HTML shown on the payment page. */
  description: string;
  /** True only after "Save & Validate" reached the portal successfully. */
  active: boolean;
};

export async function getCryptoConfig(): Promise<CryptoConfig> {
  const s = await getSettings();
  const currency = s[SETTING_KEYS.cryptoCurrency];
  return {
    endpointUrl: (s[SETTING_KEYS.cryptoEndpointUrl] ?? "").trim(),
    staticKey: (s[SETTING_KEYS.cryptoStaticKey] ?? "").trim(),
    siteKey: (s[SETTING_KEYS.cryptoSiteKey] ?? "").trim(),
    currency: currency === "USD" ? "USD" : "CAD",
    mode: s[SETTING_KEYS.cryptoMode] === "live" ? "live" : "test",
    title: s[SETTING_KEYS.cryptoTitle] || "Crypto Payment",
    description: s[SETTING_KEYS.cryptoDescription] ?? "",
    active: s[SETTING_KEYS.cryptoActive] === "1",
  };
}

/* ---------------------------------------------------------------------------
 * Server-to-server API client
 * ------------------------------------------------------------------------- */

export type ApiResult = {
  ok: boolean;
  code: number;
  data: Record<string, unknown> | null;
  error: string;
};

type ClientConfig = Pick<CryptoConfig, "endpointUrl" | "staticKey" | "siteKey">;

function apiUrl(cfg: ClientConfig, path: string, query: Record<string, string | number> = {}): string {
  const base = cfg.endpointUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/api/public/${path.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  return url.toString();
}

function authHeaders(cfg: ClientConfig): Record<string, string> {
  return { "X-Api-Key": cfg.staticKey, "X-Site-Key": cfg.siteKey, Accept: "application/json" };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Success means a 2xx, a JSON object, and `success` set - exactly the plugin's rule. */
async function decode(res: Response): Promise<ApiResult> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  const ok = res.status >= 200 && res.status < 300 && isRecord(data) && Boolean(data.success);
  const error = ok
    ? ""
    : isRecord(data) && typeof data.error === "string"
      ? data.error
      : `HTTP ${res.status}`;
  return { ok, code: res.status, data: isRecord(data) ? data : null, error };
}

async function call(
  cfg: ClientConfig,
  path: string,
  init: RequestInit & { query?: Record<string, string | number>; timeoutMs: number },
): Promise<ApiResult> {
  try {
    const { query, timeoutMs, ...rest } = init;
    const res = await fetch(apiUrl(cfg, path, query), {
      ...rest,
      headers: { ...authHeaders(cfg), ...(rest.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    return await decode(res);
  } catch (err) {
    return { ok: false, code: 0, data: null, error: err instanceof Error ? err.message : "request failed" };
  }
}

/**
 * Methods, wallets, fees and rates for a fiat currency. With an order id the
 * portal also returns its own computed payable amounts for that order - the
 * authoritative figures, which the shop only ever displays.
 */
export function getSiteData(cfg: ClientConfig, currency: string, orderId = 0): Promise<ApiResult> {
  const query: Record<string, string | number> = { currency: currency.toLowerCase() };
  if (orderId > 0) query.order_id = orderId;
  return call(cfg, "site_data.php", { method: "GET", query, timeoutMs: 15_000 });
}

/** What the customer already submitted for an order, to restore the form. */
export function getTxnState(cfg: ClientConfig, orderId: number): Promise<ApiResult> {
  return call(cfg, "txn_state.php", { method: "GET", query: { order_id: orderId }, timeoutMs: 15_000 });
}

export type TransactionPayload = {
  order_id: number;
  order_key: string;
  customer_name: string;
  customer_email: string;
  order_amount: string;
  order_currency: string;
  order_status: string;
  order_date: string;
};

/**
 * Create or update the transaction on the portal, idempotent on site + order.
 *
 * Blocking at checkout, so a failure keeps the customer on the checkout page.
 * Non-blocking for the background status sync, so a slow or unreachable
 * portal never holds up an order save.
 */
export async function upsertTransaction(
  cfg: ClientConfig,
  payload: TransactionPayload,
  blocking = true,
): Promise<ApiResult> {
  const request = call(cfg, "upsert_transaction.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: blocking ? 15_000 : 10_000,
  });
  if (!blocking) {
    void request.catch(() => undefined);
    return { ok: true, code: 0, data: null, error: "" };
  }
  return request;
}

/**
 * Forward the customer's "mark as paid" - multipart, so a screenshot can ride
 * along. No amount is sent: the portal recomputes what is owed from the order,
 * the wallet fee and the rate the page was showing.
 */
export function markPaid(
  cfg: ClientConfig,
  fields: Record<string, string>,
  screenshot: File | null,
): Promise<ApiResult> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  if (screenshot) form.append("screenshot", screenshot, screenshot.name || "screenshot");
  return call(cfg, "mark_paid.php", { method: "POST", body: form, timeoutMs: 20_000 });
}

/** A method's logo or QR code, fetched with our keys for the image proxy. */
export async function fetchAsset(
  cfg: ClientConfig,
  type: "logo" | "qr",
  method: string,
): Promise<{ body: ArrayBuffer; mime: string } | null> {
  try {
    const res = await fetch(apiUrl(cfg, "asset.php", { type, method }), {
      headers: authHeaders(cfg),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (res.status !== 200) return null;
    return {
      body: await res.arrayBuffer(),
      mime: res.headers.get("content-type") || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * Orders
 * ------------------------------------------------------------------------- */

/** The opaque per-order key the portal stores (Woo's order_key). */
export function newPaymentKey(): string {
  return `nl_order_${randomBytes(12).toString("base64url")}`;
}

/** "Y-m-d H:i:s" in the shop's time zone, as the plugin sends dates. */
export function ymdhis(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

type OrderForPortal = {
  orderNumber: string;
  paymentKey: string | null;
  shipName: string;
  email: string;
  totalCents: number;
  status: string;
  createdAt: Date;
};

export async function transactionPayload(
  order: OrderForPortal,
  cfg: Pick<CryptoConfig, "currency">,
  status?: string,
): Promise<TransactionPayload> {
  return {
    order_id: portalOrderId(order.orderNumber),
    order_key: order.paymentKey ?? "",
    customer_name: order.shipName.trim(),
    customer_email: order.email,
    order_amount: (order.totalCents / 100).toFixed(2),
    order_currency: cfg.currency,
    order_status: status ?? wooStatus(order.status),
    order_date: ymdhis(order.createdAt, await getTimeZone()),
  };
}

/**
 * Push a crypto order's current status to the portal, fire-and-forget.
 *
 * The plugin hooked woocommerce_order_status_changed, so every status change
 * by any actor reached the portal without a manual refresh. Here it is called
 * from every place an order's status changes.
 */
export function queueCryptoSync(orderId: string): void {
  void (async () => {
    const cfg = await getCryptoConfig();
    if (!cfg.active) return;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.paymentMethodKey !== CRYPTO_KEY) return;
    await upsertTransaction(cfg, await transactionPayload(order, cfg), true);
  })().catch(() => undefined);
}

/** The payment page for an order, carrying the receipt capability token. */
export function cryptoPayPath(orderNumber: string, token: string): string {
  return `/checkout/crypto/${encodeURIComponent(orderNumber)}?t=${encodeURIComponent(token)}`;
}

/* ---------------------------------------------------------------------------
 * Portal -> shop callbacks
 * ------------------------------------------------------------------------- */

function sameSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Behind Cloudflare and Apache the socket is plain HTTP; the edge says HTTPS. */
export function requestIsHttps(request: Request): boolean {
  try {
    if (new URL(request.url).protocol === "https:") return true;
  } catch {
    // Fall through to the forwarded headers.
  }
  const forwarded = request.headers.get("x-forwarded-proto") ?? "";
  if (forwarded.split(",").some((p) => p.trim().toLowerCase() === "https")) return true;
  const visitor = request.headers.get("cf-visitor") ?? "";
  return /"scheme"\s*:\s*"https"/i.test(visitor);
}

/** WP_Error's JSON shape, which the portal already understands. */
export function wpError(code: string, message: string, status: number): Response {
  return Response.json({ code, message, data: { status } }, { status });
}

/**
 * HTTPS, then the static and per-site keys in constant time. Unconfigured keys
 * authorise nothing. Returns a response to send back, or null to continue.
 */
export async function authorisePortalRequest(request: Request): Promise<Response | null> {
  if (!requestIsHttps(request)) return wpError("https_required", "HTTPS required", 400);
  const cfg = await getCryptoConfig();
  if (!cfg.staticKey || !cfg.siteKey) {
    return wpError("not_configured", "Plugin not configured", 403);
  }
  const apiKey = request.headers.get("x-api-key") ?? "";
  const siteKey = request.headers.get("x-site-key") ?? "";
  if (!sameSecret(apiKey, cfg.staticKey) || !sameSecret(siteKey, cfg.siteKey)) {
    return wpError("forbidden", "Invalid credentials", 403);
  }
  return null;
}
