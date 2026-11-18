import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { getEmtConfig, renderInstructions } from "@/lib/emt";
import { checkReceiptAccess } from "@/lib/receipt";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { CRYPTO_KEY, cryptoPayPath } from "@/lib/crypto-pay";
import { orderNo } from "@/lib/order-display";
import { isPaidStatus } from "@/lib/order-payment";
import { Shell, PageHead, Field } from "@/components/site/Shell";
import { CopyButton } from "@/components/site/CopyButton";
import { requestReceiptLink } from "../../../receipt-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order received", robots: { index: false, follow: false } };

/**
 * The thank-you page. One job above all: get the e-Transfer sent. The payment
 * details are the one dark panel, the amount set large, every value to retype
 * carrying a copy button. Order numbers are sequential, so access needs the
 * receipt token from the link or the signed-in owner (lib/receipt).
 */
export default async function OrderReceivedPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ t?: string; sent?: string }>;
}) {
  const { orderNumber } = await params;
  const sp = await searchParams;

  const [order, money, emt, viewer] = await Promise.all([
    prisma.order.findUnique({ where: { orderNumber: decodeURIComponent(orderNumber) }, include: { items: true } }),
    getMoneyFormatter(),
    getEmtConfig(),
    getCurrentCustomer(),
  ]);
  if (!order) notFound();

  const access = checkReceiptAccess({
    orderCustomerId: order.customerId,
    orderEmail: order.email,
    receiptTokenHash: order.receiptTokenHash,
    viewerCustomerId: viewer?.id ?? null,
    viewerEmail: viewer?.email ?? null,
    token: sp.t ?? null,
  });

  if (access === "denied") {
    return (
      <Shell>
        <PageHead title="Open your receipt" lede="For your privacy, receipts open from the link in your email. Ask for a fresh link here." />
        <div className="panel" style={{ maxWidth: 560 }}>
          {sp.sent ? <p className="ok-note" role="status">If the email matches the order, a new link is on its way.</p> : null}
          <form action={requestReceiptLink} className="form-narrow" style={{ marginTop: 16 }}>
            <input type="hidden" name="orderNumber" value={order.orderNumber} />
            <Field label="Email used for the order" name="email" type="email" autoComplete="email" />
            <button className="btn" type="submit">Email me the link</button>
          </form>
        </div>
      </Shell>
    );
  }

  if (order.paymentMethodKey === CRYPTO_KEY && !isPaidStatus(order.status)) {
    redirect(cryptoPayPath(order.orderNumber, sp.t ?? ""));
  }

  const fmt = (c: number) => money.formatIn(c, order.currency);
  const amount = fmt(order.totalCents);
  const label = orderNo(order.orderNumber);
  const first = (order.shipName || "").split(/\s+/)[0];
  const paid = isPaidStatus(order.status);
  const answer = order.emtSecurityAnswer ?? "";
  const configured = Boolean(emt.recipientEmail);
  const instructions = renderInstructions(emt.instructions, {
    email: emt.recipientEmail || "(not configured)",
    amount,
    order: order.orderNumber,
    answer: answer || "(not required)",
  });

  const steps = [
    { title: "Order placed", text: `Reserved under ${label}.`, state: "done" },
    paid
      ? { title: "Payment received", text: "Thank you, it landed.", state: "done" }
      : { title: `Send your ${emt.title.toLowerCase()}`, text: configured ? "Use the details on this page. Most transfers arrive in minutes." : "We'll email you the payment details shortly.", state: "now" },
    { title: "Packed and shipped", text: "We email tracking the day it ships.", state: paid ? "now" : "next" },
  ];

  return (
    <Shell>
      <PageHead
        title={paid ? "Paid. Thank you." : `Thanks${first ? `, ${first}` : ""}.`}
        lede={<>Order <b>{label}</b> is in. A copy went to {order.email}.</>}
      />

      <div className="two">
        <div>
          {paid ? (
            <section className="panel panel--dark on-dark" aria-labelledby="pay-title">
              <h2 id="pay-title" className="h2" style={{ fontSize: "2rem" }}>Payment received</h2>
              <p className="muted-dark" style={{ marginTop: 8 }}>{amount} for {label}. We&rsquo;re packing it.</p>
            </section>
          ) : (
            <section className="panel panel--dark on-dark" aria-labelledby="pay-title">
              <h2 id="pay-title" style={{ fontWeight: 700 }}>Pay by {emt.title}</h2>
              <p className="display" style={{ fontSize: "clamp(2.75rem, 1.5rem + 4vw, 4.5rem)", marginTop: 12 }}>
                {amount}
                <CopyButton value={amount.replace(/[^0-9.]/g, "")} label="amount" />
              </p>
              {configured ? (
                <dl className="rows" style={{ marginTop: 20 }}>
                  <div><dt>Send to</dt><dd>{emt.recipientEmail}<CopyButton value={emt.recipientEmail} label="email address" /></dd></div>
                  {emt.recipientName ? <div><dt>Recipient name</dt><dd>{emt.recipientName}</dd></div> : null}
                  <div><dt>Message / reference</dt><dd>{label}<CopyButton value={label} label="reference" /></dd></div>
                  {answer ? (
                    <div>
                      <dt>Security answer{emt.securityQuestion ? ` (${emt.securityQuestion})` : ""}</dt>
                      <dd>{answer}<CopyButton value={answer} label="security answer" /></dd>
                    </div>
                  ) : (
                    <div><dt>Security question</dt><dd>Not needed, auto-deposit is on</dd></div>
                  )}
                  {emt.autoCancelDays > 0 ? (
                    <div><dt>Pay within</dt><dd>{emt.autoCancelDays} day{emt.autoCancelDays === 1 ? "" : "s"}</dd></div>
                  ) : null}
                </dl>
              ) : (
                <p style={{ marginTop: 16 }}>Payment details are on their way by email. Your order is saved as {label}.</p>
              )}
              {instructions && configured ? (
                <p className="muted-dark small" style={{ marginTop: 16, whiteSpace: "pre-line" }}>{instructions}</p>
              ) : null}
            </section>
          )}

          <ol className="steps" aria-label="What happens next">
            {steps.map((s) => (
              <li key={s.title} data-state={s.state}>
                <b>{s.title}</b>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </div>

        <section className="panel" aria-labelledby="order-title">
          <h2 id="order-title" style={{ fontWeight: 700, marginBottom: 8 }}>Your order</h2>
          <dl className="rows">
            {order.items.map((i) => (
              <div key={i.id}>
                <dt>{i.quantity} × {i.nameSnapshot}{i.variantSnapshot ? ` · ${i.variantSnapshot}` : ""}</dt>
                <dd>{fmt(i.lineTotalCents)}</dd>
              </div>
            ))}
            <div><dt>Subtotal</dt><dd>{fmt(order.subtotalCents)}</dd></div>
            {order.discountCents > 0 ? <div><dt>Discount</dt><dd>−{fmt(order.discountCents)}</dd></div> : null}
            <div><dt>Shipping</dt><dd>{order.shippingCents > 0 ? fmt(order.shippingCents) : "Free"}</dd></div>
            {order.taxCents > 0 ? <div><dt>Tax</dt><dd>{fmt(order.taxCents)}</dd></div> : null}
            <div style={{ fontSize: "1.25rem" }}><dt>Total</dt><dd>{amount}</dd></div>
            <div>
              <dt>Ships to</dt>
              <dd style={{ whiteSpace: "pre-line" }}>
                {[order.shipName, order.shipLine1, order.shipLine2, `${order.shipCity}, ${order.shipRegion} ${order.shipPostalCode}`].filter(Boolean).join("\n")}
              </dd>
            </div>
          </dl>
          <p style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 20 }}>
            <Link className="link" href="/track-order">Track this order</Link>
            <a className="link" href="mailto:help@br3thr.com">help@br3thr.com</a>
          </p>
        </section>
      </div>
    </Shell>
  );
}
