import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";
import { Card, btnPrimary } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Free gifts" };
export const dynamic = "force-dynamic";

const TRIGGER_LABEL: Record<string, string> = {
  CART_TOTAL: "Cart total",
  BUY_X_GET_Y: "Buy X get Y",
  COUPON: "Coupon",
};

const REWARD_LABEL: Record<string, string> = {
  PRODUCT: "Free product",
  CHEAPEST_IN_CART: "Cheapest item free",
  FREE_SHIPPING: "Free shipping",
};

export default async function GiftRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  await requireCapability("promotions");
  const [{ deleted }, rules, money] = await Promise.all([
    searchParams,
    prisma.giftRule.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: { gifts: { include: { variant: { select: { name: true, product: { select: { name: true } } } } } } },
    }),
    getMoneyFormatter(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Free gifts
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Give something away when a cart qualifies. Gifts appear and
            disappear on their own as the cart changes.
          </p>
        </div>
        <Link href="/admin/promotions/gifts/new" className={btnPrimary}>
          New offer
        </Link>
      </div>

      {deleted ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Offer deleted.
        </p>
      ) : null}

      <Card className="overflow-hidden">
        {rules.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-slate-500">
            No gift offers yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full ">
              <thead className="bg-slate-50/80">
                <tr>
                  {["Offer", "Trigger", "Reward", "Status", ""].map((h) => (
                    <th
                      key={h}
                      className={`px-3 lg:px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                        h === "" ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-3 lg:px-5 py-4">
                      <Link
                        href={`/admin/promotions/gifts/${r.id}`}
                        className="text-sm font-semibold text-slate-900 hover:text-[var(--admin-accent)]"
                      >
                        {r.name}
                      </Link>
                      {r.gifts.length > 0 ? (
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {r.gifts
                            .map((g) => `${g.variant.product.name} — ${g.variant.name}`)
                            .join(", ")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 lg:px-5 py-4 text-sm text-slate-600">
                      {TRIGGER_LABEL[r.trigger]}
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {r.trigger === "CART_TOTAL"
                          ? `over ${money.format(r.minSubtotalCents)}`
                          : r.trigger === "BUY_X_GET_Y"
                            ? `buy ${r.triggerQuantity}${r.repeats ? ", repeating" : ""}`
                            : (r.couponCode ?? "—")}
                        {r.trigger === "COUPON"
                          ? ""
                          : (() => {
                              const p = r.triggerProductIds.length || (r.triggerProductId ? 1 : 0);
                              const c = r.triggerCategoryIds.length || (r.triggerCategoryId ? 1 : 0);
                              return p
                                ? ` · ${p} product${p === 1 ? "" : "s"}`
                                : c
                                  ? ` · ${c} categor${c === 1 ? "y" : "ies"}`
                                  : " · all products";
                            })()}
                      </span>
                    </td>
                    <td className="px-3 lg:px-5 py-4 text-sm text-slate-600">
                      {REWARD_LABEL[r.reward]}
                    </td>
                    <td className="px-3 lg:px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          r.isEnabled
                            ? "bg-[#E2EEEA] text-[var(--admin-accent)]"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {r.isEnabled ? "Live" : "Off"}
                      </span>
                    </td>
                    <td className="px-3 lg:px-5 py-4">
                      <div className="flex justify-end">
                        <Link
                          href={`/admin/promotions/gifts/${r.id}`}
                          className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
