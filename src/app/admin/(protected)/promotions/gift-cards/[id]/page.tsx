import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card, btnDanger, btnGhost, btnPrimary } from "@/components/admin/ui";
import { Field, fieldInput } from "@/components/admin/Field";
import { TH } from "@/components/admin/PageCard";
import { requireCapability } from "@/lib/permissions";
import { getTimeZone, ymd } from "@/lib/timezone";
import { formatGiftCardCode } from "@/lib/gift-card-core";
import { adjustGiftCardAction, resendGiftCard, voidGiftCardAction } from "../actions";

export const metadata: Metadata = { title: "Gift card" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  ISSUE: "Issued",
  REDEEM: "Spent",
  RESTORE: "Returned (order cancelled)",
  VOID: "Voided",
  ADJUST: "Adjusted by staff",
};

const MESSAGES: Record<string, { tone: "ok" | "bad"; text: string }> = {
  saved: { tone: "ok", text: "Saved." },
  sent: { tone: "ok", text: "Email sent." },
  send: { tone: "bad", text: "The email could not be sent — check that email is set up in settings and the card is active." },
  adjust: { tone: "bad", text: "Enter an amount and a reason." },
  balance: { tone: "bad", text: "That would take the card below zero, or the card is void." },
};

export default async function GiftCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; sent?: string; error?: string }>;
}) {
  await requireCapability("promotions");
  const [{ id }, sp, money, tz] = await Promise.all([params, searchParams, getMoneyFormatter(), getTimeZone()]);
  const card = await prisma.giftCard.findUnique({
    where: { id },
    include: {
      purchaseOrder: { select: { id: true, orderNumber: true } },
      transactions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!card) notFound();

  const orderIds = [...new Set(card.transactions.map((t) => t.orderId).filter((o): o is string => Boolean(o)))];
  const orders = new Map(
    (await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true } })).map(
      (o) => [o.id, o.orderNumber],
    ),
  );
  const notice = sp.error ? MESSAGES[sp.error] : sp.sent ? MESSAGES.sent : sp.saved ? MESSAGES.saved : null;

  return (
    <div className="space-y-5">
      <Link href="/admin/promotions/gift-cards" className="text-sm text-slate-500 hover:text-slate-900">
        &larr; All gift cards
      </Link>

      {notice ? (
        <p
          role="status"
          className={`rounded-2xl border px-4 py-3 text-sm ${
            notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-6">
            <p className="font-mono text-2xl font-semibold tracking-wider text-slate-900">{formatGiftCardCode(card.code)}</p>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Balance</dt>
                <dd className="mt-0.5 text-lg font-semibold text-slate-900">{money.format(card.balanceCents)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Amount</dt>
                <dd className="mt-0.5 text-slate-900">{money.format(card.initialCents)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd className="mt-0.5 text-slate-900">
                  {card.status === "PENDING" ? "Awaiting payment" : card.status === "ACTIVE" ? "Active" : "Void"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">For</dt>
                <dd className="mt-0.5 text-slate-900">
                  {card.recipientName}
                  <span className="block text-xs text-slate-500">
                    {card.deliverTo === "RECIPIENT" ? card.recipientEmail : "Sent to the buyer to give in person"}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">From</dt>
                <dd className="mt-0.5 text-slate-900">
                  {card.senderName}
                  <span className="block text-xs text-slate-500">{card.buyerEmail}</span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Bought on</dt>
                <dd className="mt-0.5 text-slate-900">
                  {card.purchaseOrder ? (
                    <Link href={`/admin/orders/${card.purchaseOrder.id}`} className="text-[var(--admin-accent)] hover:underline">
                      Order #{card.purchaseOrder.orderNumber}
                    </Link>
                  ) : (
                    "—"
                  )}
                  <span className="block text-xs text-slate-500">
                    {card.emailedAt ? `Emailed ${ymd(card.emailedAt, tz)}` : "Not emailed yet"}
                  </span>
                </dd>
              </div>
            </dl>
            {card.message ? (
              <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">&ldquo;{card.message}&rdquo;</p>
            ) : null}
          </Card>

          <Card className="overflow-hidden">
            <h2 className="px-6 pt-6 text-base font-semibold text-slate-900">History</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/80">
                  <tr>
                    <TH>Date</TH>
                    <TH>What</TH>
                    <TH>Order</TH>
                    <TH align="right">Amount</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {card.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-sm text-slate-500">
                        Nothing yet — the card is issued when its order&rsquo;s payment is confirmed.
                      </td>
                    </tr>
                  ) : (
                    card.transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="px-3 py-3 text-xs text-slate-500 lg:px-5">{ymd(t.createdAt, tz)}</td>
                        <td className="px-3 py-3 text-sm text-slate-700 lg:px-5">
                          {KIND_LABEL[t.kind]}
                          {t.note ? <span className="block text-xs text-slate-500">{t.note}</span> : null}
                        </td>
                        <td className="px-3 py-3 text-sm lg:px-5">
                          {t.orderId && orders.has(t.orderId) ? (
                            <Link href={`/admin/orders/${t.orderId}`} className="text-[var(--admin-accent)] hover:underline">
                              #{orders.get(t.orderId)}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          className={`px-3 py-3 text-right text-sm font-semibold lg:px-5 ${
                            t.amountCents < 0 ? "text-red-600" : "text-emerald-700"
                          }`}
                        >
                          {t.amountCents < 0 ? "−" : "+"}
                          {money.format(Math.abs(t.amountCents))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {card.status === "ACTIVE" ? (
            <Card className="p-6">
              <h2 className="text-base font-semibold text-slate-900">Email</h2>
              <p className="mt-1 text-xs text-slate-500">
                Sends the gift card email again
                {card.deliverTo === "RECIPIENT" ? ` to ${card.recipientEmail}, with a copy to the buyer` : " to the buyer"}.
              </p>
              <form action={resendGiftCard} className="mt-4">
                <input type="hidden" name="id" value={card.id} />
                <button type="submit" className={btnGhost}>
                  Resend email
                </button>
              </form>
            </Card>
          ) : null}

          {card.status !== "VOID" ? (
            <Card className="p-6">
              <h2 className="text-base font-semibold text-slate-900">Adjust balance</h2>
              <form action={adjustGiftCardAction} className="mt-4 space-y-4">
                <input type="hidden" name="id" value={card.id} />
                <Field label="Amount (use - to take off)" htmlFor="amount">
                  <input id="amount" name="amount" placeholder="5.00 or -5.00" className={fieldInput} />
                </Field>
                <Field label="Reason" htmlFor="note">
                  <input id="note" name="note" required placeholder="e.g. Goodwill for a late order" className={fieldInput} />
                </Field>
                <button type="submit" className={btnPrimary}>
                  Adjust
                </button>
              </form>
            </Card>
          ) : null}

          {card.status !== "VOID" ? (
            <Card className="p-6">
              <h2 className="text-base font-semibold text-slate-900">Void this card</h2>
              <p className="mt-1 text-xs text-slate-500">
                It stops working at once and its balance goes to zero. This can&rsquo;t be undone.
              </p>
              <form action={voidGiftCardAction} className="mt-4 space-y-3">
                <input type="hidden" name="id" value={card.id} />
                <input name="note" placeholder="Reason (optional)" aria-label="Reason" className={fieldInput} />
                <button type="submit" className={btnDanger}>
                  Void card
                </button>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
