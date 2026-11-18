import { Shell, PageHead } from "@/components/site/Shell";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { checkReceiptAccess } from "@/lib/receipt";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { isPaidStatus } from "@/lib/order-payment";
import { orderNo } from "@/lib/order-display";
import {
  CRYPTO_KEY,
  getCryptoConfig,
  getSiteData,
  getTxnState,
  METHOD_KEY_RE,
  RATE_REFRESH_SECONDS,
} from "@/lib/crypto-pay";
import { portalOrderId } from "@/lib/portal";
import { FIAT_DECIMALS, scale } from "@/lib/crypto-money";
import { sanitizeRichText } from "@/lib/rich-text";
import { CryptoPayPanel, type CryptoMethod } from "@/components/site/CryptoPayPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crypto payment",
  robots: { index: false, follow: false },
};

function Box({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <Shell>
      <div className="panel" style={{ maxWidth: 640, textAlign: center ? "center" : undefined }}>{children}</div>
    </Shell>
  );
}

const asString = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** PHP's empty(): false for "", "0", 0, null, false and a missing value. */
const present = (v: unknown) => !(v === undefined || v === null || v === "" || v === "0" || v === 0 || v === false);

/** wpautop, enough for a short description: paragraphs and line breaks. */
function autop(html: string): string {
  if (!html.trim()) return "";
  if (/<(p|div|ul|ol|h[1-6]|table|blockquote)\b/i.test(html)) return html;
  return html
    .split(/\n\s*\n/)
    .map((para) => `<p>${para.trim().replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * The customer's crypto payment page - the plugin's [crypto_payment] shortcode.
 *
 * Reached through the private link issued at checkout. Shows a success state
 * once paid, refuses orders that are not awaiting payment, and otherwise lists
 * the currencies the portal can take for this order with the amounts the
 * portal computed.
 */
export default async function CryptoPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { orderNumber } = await params;
  const sp = await searchParams;

  const [order, viewer, cfg] = await Promise.all([
    prisma.order.findUnique({ where: { orderNumber: decodeURIComponent(orderNumber) } }),
    getCurrentCustomer(),
    getCryptoConfig(),
  ]);

  if (!sp.t && !viewer) {
    return (
      <Box>
        <p className="text-sm text-slate-700">Missing order reference.</p>
      </Box>
    );
  }

  const access = order
    ? checkReceiptAccess({
        orderCustomerId: order.customerId,
        orderEmail: order.email,
        receiptTokenHash: order.receiptTokenHash,
        viewerCustomerId: viewer?.id ?? null,
        viewerEmail: viewer?.email ?? null,
        token: sp.t ?? null,
      })
    : "denied";

  if (!order || access === "denied" || order.paymentMethodKey !== CRYPTO_KEY) {
    return (
      <Box>
        <p className="text-sm text-slate-700">This payment link is invalid.</p>
      </Box>
    );
  }

  if (isPaidStatus(order.status)) {
    return (
      <Box center>
        <span className="mb-3 inline-block" aria-hidden="true">
          <svg viewBox="0 0 52 52" width="72" height="72" xmlns="http://www.w3.org/2000/svg">
            <circle cx="26" cy="26" r="24" fill="none" stroke="#2ea44f" strokeWidth="2" />
            <path
              fill="none"
              stroke="#2ea44f"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 27l7 7 15-15"
            />
          </svg>
        </span>
        <h1 className="mb-2 text-2xl font-bold text-emerald-800">Payment received</h1>
        <p className="text-sm text-slate-600">
          Thank you — your payment for order {orderNo(order.orderNumber)} has been received.
        </p>
      </Box>
    );
  }

  if (order.status !== "AWAITING_PAYMENT") {
    return (
      <Box>
        <p className="text-sm text-slate-700">This order is not awaiting payment.</p>
      </Box>
    );
  }

  if (!cfg.active) {
    return (
      <Box>
        <p className="text-sm text-slate-700">
          Crypto payment is not currently available. Please contact support.
        </p>
      </Box>
    );
  }

  // The methods AND the authoritative payable amounts, computed by the portal
  // from its stored copy of this order. The shop only displays them.
  const portalId = portalOrderId(order.orderNumber);
  const site = await getSiteData(cfg, cfg.currency, portalId);
  if (!site.ok || !site.data) {
    return (
      <Box>
        <p className="text-sm text-slate-700">Unable to load payment options right now. Please refresh the page.</p>
      </Box>
    );
  }

  // Fail closed: only methods that carry portal-computed amounts are shown.
  const rawMethods = Array.isArray(site.data.methods) ? (site.data.methods as unknown[]) : [];
  const methods: CryptoMethod[] = rawMethods.flatMap((m) => {
    if (!m || typeof m !== "object") return [];
    const r = m as Record<string, unknown>;
    if (!r.amounts || typeof r.amounts !== "object" || Array.isArray(r.amounts)) return [];
    const methodKey = asString(r.method_key);
    if (!METHOD_KEY_RE.test(methodKey)) return [];
    const amounts = r.amounts as Record<string, unknown>;
    const rate = r.rate && typeof r.rate === "object" ? (r.rate as Record<string, unknown>) : {};
    return [
      {
        methodKey,
        label: asString(r.label) || methodKey.toUpperCase(),
        symbol: asString(r.symbol),
        network: asString(r.network),
        address: asString(r.address),
        description: asString(r.description),
        hasQr: r.has_qr === true || asString(r.has_qr) === "1",
        rateUuid: asString(rate.uuid),
        cryptoTotal: asString(amounts.crypto_total),
        baseCrypto: asString(amounts.base_crypto),
        feeCrypto: asString(r.fee_crypto),
      },
    ];
  });

  const fiat = (asString(site.data.fiat) || cfg.currency).toUpperCase();
  // The portal's order total is authoritative; the shop's own is the fallback.
  const orderTotal =
    site.data.order_amount !== undefined && site.data.order_amount !== null
      ? asString(site.data.order_amount)
      : scale((order.totalCents / 100).toFixed(2), FIAT_DECIMALS);

  // A previous submission, to restore the form and show that it went through.
  const state = await getTxnState(cfg, portalId);
  const previous = state.ok && state.data ? state.data : {};
  const submitted = state.ok && present(previous.transfer_status);

  const description = sanitizeRichText(autop(cfg.description));

  return (
    <Shell>
      <PageHead title="Pay with crypto" lede={<>Order <b>{orderNo(order.orderNumber)}</b> is held until the transfer lands.</>} />
      <div style={{ maxWidth: 640 }}>
        {description ? (
          <div
            className="nl-prose mb-7 text-sm text-slate-600"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        ) : null}

        <CryptoPayPanel
          orderNumber={order.orderNumber}
          token={sp.t ?? ""}
          orderTotal={orderTotal}
          fiat={fiat}
          methods={methods}
          submitted={submitted}
          prev={{
            txnHash: asString(previous.txn_hash),
            notes: asString(previous.customer_notes),
            hasScreenshot: present(previous.has_screenshot),
          }}
          countdownSeconds={RATE_REFRESH_SECONDS}
        />
      </div>
    </Shell>
  );
}
