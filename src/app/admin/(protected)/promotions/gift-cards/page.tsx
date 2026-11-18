import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card, btnPrimary } from "@/components/admin/ui";
import { fieldInput, fieldSelect } from "@/components/admin/Field";
import { TH, Empty } from "@/components/admin/PageCard";
import { requireCapability } from "@/lib/permissions";
import { getTimeZone, ymd } from "@/lib/timezone";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { formatGiftCardCode, normalizeGiftCardCode } from "@/lib/gift-card-core";
import { saveGiftCardSettings } from "./actions";

export const metadata: Metadata = { title: "Gift Cards" };
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  VOID: "bg-slate-100 text-slate-500",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Awaiting payment",
  ACTIVE: "Active",
  VOID: "Void",
};

export default async function GiftCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; saved?: string }>;
}) {
  await requireCapability("promotions");
  const [{ q, status, saved }, money, tz, settings] = await Promise.all([
    searchParams,
    getMoneyFormatter(),
    getTimeZone(),
    getSettings(),
  ]);

  const term = (q ?? "").trim();
  const where: Prisma.GiftCardWhereInput = {
    ...(status === "PENDING" || status === "ACTIVE" || status === "VOID" ? { status } : {}),
    ...(term
      ? {
          OR: [
            { code: { contains: normalizeGiftCardCode(term) } },
            { buyerEmail: { contains: term, mode: "insensitive" } },
            { recipientEmail: { contains: term, mode: "insensitive" } },
            { recipientName: { contains: term, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [cards, totals] = await Promise.all([
    prisma.giftCard.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { purchaseOrder: { select: { id: true, orderNumber: true } } },
    }),
    prisma.giftCard.aggregate({ where: { status: "ACTIVE" }, _sum: { balanceCents: true }, _count: true }),
  ]);
  const enabled = settings[SETTING_KEYS.giftCardsEnabled] !== "0";

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
            <h1 className="text-xl font-semibold text-slate-900">Gift Cards</h1>
            <Link href="/products/gift-card" target="_blank" className="text-sm font-medium text-[var(--admin-accent)] hover:underline">
              View gift card page
            </Link>
          </div>

          <form className="flex flex-wrap gap-3 px-6 pt-5">
            <input
              name="q"
              defaultValue={term}
              placeholder="Code, email or name"
              aria-label="Search gift cards"
              className={`${fieldInput} min-w-[200px] flex-1`}
            />
            <select name="status" defaultValue={status ?? ""} aria-label="Status" className={`${fieldSelect} w-auto`}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Awaiting payment</option>
              <option value="VOID">Void</option>
            </select>
            <button type="submit" className={btnPrimary}>
              Search
            </button>
          </form>

          <div className="h-5" />

          {cards.length === 0 ? (
            <Empty>{term || status ? "No gift cards match." : "No gift cards sold yet."}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/80">
                  <tr>
                    <TH>Code</TH>
                    <TH>For</TH>
                    <TH align="right">Amount</TH>
                    <TH align="right">Balance</TH>
                    <TH>Status</TH>
                    <TH>Bought</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cards.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-4 lg:px-5">
                        <Link
                          href={`/admin/promotions/gift-cards/${c.id}`}
                          className="font-mono text-[13px] font-semibold text-slate-900 hover:text-[var(--admin-accent)]"
                        >
                          {formatGiftCardCode(c.code)}
                        </Link>
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-700 lg:px-5">
                        {c.recipientName}
                        <span className="block text-xs text-slate-500">
                          {c.deliverTo === "RECIPIENT" ? c.recipientEmail : `via ${c.buyerEmail}`}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-right text-sm text-slate-700 lg:px-5">{money.format(c.initialCents)}</td>
                      <td className="px-3 py-4 text-right text-sm font-semibold text-slate-900 lg:px-5">{money.format(c.balanceCents)}</td>
                      <td className="px-3 py-4 lg:px-5">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-xs text-slate-500 lg:px-5">
                        {ymd(c.createdAt, tz)}
                        {c.purchaseOrder ? (
                          <Link href={`/admin/orders/${c.purchaseOrder.id}`} className="block text-[var(--admin-accent)] hover:underline">
                            Order #{c.purchaseOrder.orderNumber}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="p-6">
          <p className="text-sm text-slate-500">Unspent on active cards</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{money.format(totals._sum.balanceCents ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {totals._count} active {totals._count === 1 ? "card" : "cards"}
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900">Settings</h2>
          {saved ? <p className="mt-2 text-xs font-medium text-emerald-700">Saved</p> : null}
          <form action={saveGiftCardSettings} className="mt-4 space-y-4">
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input type="checkbox" name="enabled" defaultChecked={enabled} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
              <span className="text-sm text-slate-700">
                Sell gift cards
                <span className="mt-0.5 block text-xs text-slate-500">
                  Off hides the gift card page. Cards already sold can still be spent.
                </span>
              </span>
            </label>
            <p className="text-xs text-slate-500">
              The amounts, picture and wording are the Gift Card product&rsquo;s own &mdash; edit them in{" "}
              <Link href="/admin/products?q=gift%20card" className="font-medium text-[var(--admin-accent)] hover:underline">
                Products
              </Link>
              .
            </p>
            <button type="submit" className={btnPrimary}>
              Save
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
