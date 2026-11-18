import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card } from "@/components/admin/ui";
import { IconImage } from "@/components/admin/Icons";
import { TH, Empty } from "@/components/admin/PageCard";
import { toggleProductFeatured } from "../actions";
import { requireCapability } from "@/lib/permissions";

export const metadata: Metadata = { title: "Featured deal" };
export const dynamic = "force-dynamic";

export default async function FeaturedPage() {
  await requireCapability("promotions");
  const [products, money] = await Promise.all([
    prisma.product.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: [{ featured: "desc" }, { name: "asc" }],
      take: 200,
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        variants: { select: { priceCents: true } },
        category: { select: { name: true } },
      },
    }),
    getMoneyFormatter(),
  ]);

  const featuredCount = products.filter((p) => p.featured).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Featured deal
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Featured products get promoted on the homepage. {featuredCount} of{" "}
          {products.length} currently featured.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="h-6" />
        {products.length === 0 ? (
          <Empty>No products yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full ">
              <thead className="bg-slate-50/80">
                <tr>
                  <TH>Product</TH>
                  <TH>Category</TH>
                  <TH align="right">Price</TH>
                  <TH>Status</TH>
                  <TH align="right">Featured</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const prices = p.variants.map((v) => v.priceCents);
                  const low = prices.length ? Math.min(...prices) : 0;
                  const img = p.images[0];

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-3 lg:px-5 py-4">
                        <div className="flex items-center gap-3">
                          {img ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={img.url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                          ) : (
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                              <IconImage />
                            </span>
                          )}
                          <Link
                            href={`/admin/products/${p.id}`}
                            className="text-sm font-medium text-slate-900 hover:text-[var(--admin-accent)]"
                          >
                            {p.name}
                          </Link>
                        </div>
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-sm text-slate-600">
                        {p.category?.name ?? "—"}
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                        {money.format(low)}
                      </td>
                      <td className="px-3 lg:px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                            p.status === "PUBLISHED"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {p.status === "PUBLISHED" ? "Publish" : "Draft"}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-4">
                        <form action={toggleProductFeatured} className="flex justify-end">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="featured" value={p.featured ? "0" : "1"} />
                          <button
                            type="submit"
                            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                              p.featured
                                ? "bg-[var(--admin-btn)] text-[var(--admin-btn-ink)] hover:bg-[var(--admin-btn)]"
                                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {p.featured ? "Featured" : "Not featured"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
