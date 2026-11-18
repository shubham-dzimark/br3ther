import Link from "next/link";
import type { Metadata } from "next";
import { requireCapability } from "@/lib/permissions";
import { SectionCard } from "@/components/admin/Field";
import { ProductImportForm } from "@/components/admin/ProductImportForm";
import { importProducts } from "./actions";
import { PRODUCT_CSV_HEADERS } from "@/lib/product-csv";

export const metadata: Metadata = { title: "Import products" };
export const dynamic = "force-dynamic";

/** The handful worth spelling out; the rest are self-explanatory from the name. */
const NOTES: Record<string, string> = {
  slug: "The product's web address, and how a row is matched to a product. Left blank, it is made from the name.",
  sku: "The option's own code, and how a row is matched to an option. Must be unique across the shop.",
  variant_name: "The option's name - \"Single unit\", \"Large\", \"250 ml\". One row per option.",
  price: "In dollars, no symbol. 24.99",
  compare_at_price: "The struck-through was-price. 0 removes it.",
  categories: "Several separated by | - they must already exist in the shop.",
  images: "Gallery URLs separated by |. Filling this in replaces the gallery.",
  status: "DRAFT, PUBLISHED or ARCHIVED. A new product with no status waits as a draft.",
};

export default async function ImportProductsPage() {
  await requireCapability("catalog");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Import products</h1>
          <p className="mt-1 text-sm text-slate-500">
            Add new products or change the ones you have, from a spreadsheet.
          </p>
        </div>
        <Link
          href="/admin/products"
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Back to products
        </Link>
      </div>

      <SectionCard
        title="Upload a CSV"
        action={
          <a
            href="/api/admin/export/products?sample=1"
            className="rounded-full border border-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
          >
            Download sample CSV
          </a>
        }
      >
        <div className="mb-6 space-y-2 rounded-2xl bg-slate-50 px-4 py-3.5 text-sm text-slate-600">
          <p>
            <strong className="font-semibold text-slate-800">Nothing is ever deleted.</strong> A
            product that is not in the file is left exactly as it is.
          </p>
          <p>
            <strong className="font-semibold text-slate-800">A blank cell changes nothing.</strong>{" "}
            To keep a description, leave that cell empty - or delete the whole column.
          </p>
          <p>
            <strong className="font-semibold text-slate-800">One row per option.</strong> A product
            with three sizes is three rows sharing the same <code className="rounded bg-white px-1">slug</code>;
            only the first needs the product&rsquo;s own columns.
          </p>
          <p>
            Column order does not matter, and columns you do not need can be removed. The quickest
            start is to export what you have, change it, and send the same file back.
          </p>
        </div>

        <ProductImportForm action={importProducts} />
      </SectionCard>

      <SectionCard title="Columns">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4 font-semibold">Column</th>
                <th className="py-2 font-semibold">What it is</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PRODUCT_CSV_HEADERS.map((h) => (
                <tr key={h}>
                  <td className="py-2 pr-4 align-top">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                      {h}
                    </code>
                  </td>
                  <td className="py-2 align-top text-slate-600">
                    {NOTES[h] ?? <span className="text-slate-400">&mdash;</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
