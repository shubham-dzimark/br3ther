import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card } from "@/components/admin/ui";
import { TH, Empty } from "@/components/admin/PageCard";
import { requireCapability } from "@/lib/permissions";

export const metadata: Metadata = { title: "Top products" };
export const dynamic = "force-dynamic";

const PAID = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

export default async function TopProductsPage() {
  await requireCapability("reports");
  const money = await getMoneyFormatter();

  // Only count items belonging to orders that were actually paid for.
  const items = await prisma.orderItem.findMany({
    where: { order: { status: { in: [...PAID] } } },
    select: {
      productId: true,
      nameSnapshot: true,
      quantity: true,
      lineTotalCents: true,
      product: { select: { id: true, name: true, categoryId: true, category: { select: { name: true } } } },
    },
  });

  const byProduct = new Map<
    string,
    { name: string; id: string | null; category: string; units: number; revenue: number }
  >();
  const byCategory = new Map<string, { units: number; revenue: number }>();

  for (const it of items) {
    const key = it.productId ?? `deleted:${it.nameSnapshot}`;
    const cur = byProduct.get(key) ?? {
      name: it.product?.name ?? it.nameSnapshot,
      id: it.product?.id ?? null,
      category: it.product?.category?.name ?? "Uncategorised",
      units: 0,
      revenue: 0,
    };
    cur.units += it.quantity;
    cur.revenue += it.lineTotalCents;
    byProduct.set(key, cur);

    const catKey = it.product?.category?.name ?? "Uncategorised";
    const c = byCategory.get(catKey) ?? { units: 0, revenue: 0 };
    c.units += it.quantity;
    c.revenue += it.lineTotalCents;
    byCategory.set(catKey, c);
  }

  const products = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 50);
  const categories = [...byCategory.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  const topRevenue = products[0]?.revenue ?? 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Top products &amp; categories
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Ranked by revenue from paid orders. Deleted products still appear, using
          the name recorded on the order.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="px-6 pt-6">
            <h2 className="text-lg font-semibold text-slate-900">Top products</h2>
          </div>
          <div className="h-5" />
          {products.length === 0 ? (
            <Empty>No paid orders yet, so there is nothing to rank.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full ">
                <thead className="bg-slate-50/80">
                  <tr>
                    <TH>Product</TH>
                    <TH>Category</TH>
                    <TH align="right">Units</TH>
                    <TH align="right">Revenue</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((p) => (
                    <tr key={p.id ?? p.name} className="hover:bg-slate-50/60">
                      <td className="px-3 lg:px-5 py-3">
                        {p.id ? (
                          <Link
                            href={`/admin/products/${p.id}`}
                            className="text-sm font-medium text-slate-900 hover:text-[var(--admin-accent)]"
                          >
                            {p.name}
                          </Link>
                        ) : (
                          <span className="text-sm text-slate-500">
                            {p.name}{" "}
                            <span className="text-xs text-slate-400">(deleted)</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 lg:px-5 py-3 text-sm text-slate-600">{p.category}</td>
                      <td className="px-3 lg:px-5 py-3 text-right text-sm tabular-nums text-slate-600">
                        {p.units}
                      </td>
                      <td className="px-3 lg:px-5 py-3 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                        <span title={money.format(p.revenue)}>{money.compact(p.revenue)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-5 text-lg font-semibold text-slate-900">By category</h2>
          {categories.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing sold yet.</p>
          ) : (
            <ul className="space-y-4">
              {categories.map(([name, c]) => (
                <li key={name}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-slate-600">{name}</span>
                    <span className="font-semibold tabular-nums text-slate-900">
                      <span title={money.format(c.revenue)}>{money.compact(c.revenue)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[var(--admin-accent)]"
                      style={{
                        width: `${Math.max(3, Math.round((c.revenue / topRevenue) * 100))}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
