import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";
import { btnDanger, btnGhost } from "@/components/admin/ui";
import { SectionCard } from "@/components/admin/Field";
import { ProductPicker } from "@/components/admin/ProductPicker";
import { BundleRuleEditor } from "@/components/admin/BundleRuleEditor";
import { sanitizeTiers, tiersKey, type QuantityTier } from "@/lib/quantity-tiers";
import { applyBundleRule, removeBundleRule } from "./actions";

export const metadata: Metadata = { title: "Bundle & Save" };
export const dynamic = "force-dynamic";

const PAGE = "/admin/products/bundle-save";

/** A sensible first rule: each step up costs more in total than the last. */
const STARTER: QuantityTier[] = [
  { qty: 2, percent: 10, badge: "Most Popular" },
  { qty: 3, percent: 15, badge: "" },
];

type Search = {
  ids?: string;
  edit?: string;
  scope?: string;
  category?: string;
  t?: string;
  error?: string;
  done?: string;
  removed?: string;
};

function RuleChips({ tiers }: { tiers: QuantityTier[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tiers.map((t) => (
        <span
          key={t.qty}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--admin-accent)]/10 px-3 py-1 text-xs font-medium text-slate-800"
        >
          Buy {t.qty}
          {t.percent > 0 ? <span className="font-semibold text-[var(--admin-accent)]">−{t.percent}%</span> : null}
          {t.badge ? (
            <span className="rounded-full bg-white px-1.5 py-px text-[10px] font-semibold text-slate-600">{t.badge}</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

/**
 * Bundle & Save rules, set for many products at once. Choose products (or a
 * category, or everything), set the quantity breaks, apply. Products sharing
 * the same rule are listed together so a rule can be edited or removed as one.
 */
export default async function BundleSavePage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireCapability("catalog");
  const sp = await searchParams;

  const [products, categories, money] = await Promise.all([
    prisma.product.findMany({
      // Sold on another site: no cart, so a quantity discount means nothing.
      where: { type: { not: "EXTERNAL" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true, soldIndividually: true, quantityTiers: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getMoneyFormatter(),
  ]);

  const withRule = products
    .map((p) => ({ ...p, tiers: sanitizeTiers(p.quantityTiers) }))
    .filter((p) => p.tiers.some((t) => t.percent > 0));

  const groups = new Map<string, { tiers: QuantityTier[]; products: typeof withRule }>();
  for (const p of withRule) {
    const key = tiersKey(p.tiers);
    const group = groups.get(key);
    if (group) group.products.push(p);
    else groups.set(key, { tiers: p.tiers, products: [p] });
  }
  const groupList = [...groups.values()].sort((a, b) => b.products.length - a.products.length);

  const editing = sp.edit ? withRule.find((p) => p.id === sp.edit) : undefined;
  let returned: QuantityTier[] = [];
  try {
    returned = sp.t ? sanitizeTiers(JSON.parse(sp.t)) : [];
  } catch {
    returned = [];
  }
  const startTiers = returned.length ? returned : editing ? editing.tiers : STARTER;

  const known = new Set(products.map((p) => p.id));
  const preselected = editing
    ? (groups.get(tiersKey(editing.tiers))?.products.map((p) => p.id) ?? [])
    : [...new Set((sp.ids ?? "").split(",").map((s) => s.trim()))].filter((id) => known.has(id));
  const scope = sp.scope === "category" || sp.scope === "all" ? sp.scope : "products";
  const soldAlone = products.filter((p) => p.soldIndividually).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bundle &amp; Save</h1>
        <p className="mt-1 text-sm text-slate-500">
          Quantity discounts on the product page &mdash; Buy 2 save 10%, Buy 3 save 15% &mdash; set once for as
          many products as you like. The discount comes off every unit in the cart once a shopper has that many of a
          product, in any mix of its options.
        </p>
      </div>

      {sp.done ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Bundle rule saved on {sp.done} product{sp.done === "1" ? "" : "s"}.
        </p>
      ) : null}
      {sp.removed ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Bundle rule removed from {sp.removed} product{sp.removed === "1" ? "" : "s"}.
        </p>
      ) : null}
      {sp.error ? (
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {sp.error}
        </p>
      ) : null}

      <SectionCard title={editing ? "Edit bundle rule" : "Create a bundle rule"}>
        <form action={applyBundleRule} className="space-y-8">
          {/* Keyed on what the URL says, so the radios and picker are rebuilt from
              it after every save or error; uncontrolled inputs otherwise keep
              (or reset to) the choice from the first load. */}
          <fieldset key={`${scope}|${sp.category ?? ""}|${sp.ids ?? ""}|${sp.edit ?? ""}|${sp.done ?? ""}|${sp.error ?? ""}`}>
            <legend className="mb-3 text-sm font-medium text-slate-700">Apply to</legend>
            <div className="space-y-4 text-sm text-slate-700">
              <div>
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="scope"
                    value="products"
                    defaultChecked={scope === "products"}
                    className="h-4 w-4 accent-[var(--admin-accent)]"
                  />
                  Selected products
                </label>
                <div className="mt-3 pl-7">
                  <ProductPicker
                    name="productIds"
                    options={products.map((p) => ({ id: p.id, name: p.name, note: p.status === "PUBLISHED" ? null : "Draft" }))}
                    defaultValue={preselected}
                    minChars={1}
                    placeholder="Type a product name…"
                  />
                </div>
              </div>
              <label className="flex flex-wrap items-center gap-3">
                <input
                  type="radio"
                  name="scope"
                  value="category"
                  defaultChecked={scope === "category"}
                  className="h-4 w-4 accent-[var(--admin-accent)]"
                />
                Every product in category
                <select
                  name="category"
                  defaultValue={sp.category ?? ""}
                  aria-label="Category"
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-sm"
                >
                  <option value="">Choose…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3">
                <input type="radio" name="scope" value="all" defaultChecked={scope === "all"} className="h-4 w-4 accent-[var(--admin-accent)]" />
                Every product in the store
              </label>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Replaces any bundle rule those products already have.
              {soldAlone > 0
                ? ` Products set to "sold individually" (${soldAlone}) keep the rule but don't show it.`
                : ""}
            </p>
          </fieldset>

          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Quantity breaks</p>
            <p className="mb-4 text-xs text-slate-500">
              Quantity 1 can carry a badge but no discount. Leave a row&rsquo;s quantity empty to skip it. Each bigger
              quantity has to cost more in total than the one before it.
            </p>
            <BundleRuleEditor
              key={`${sp.edit ?? ""}|${sp.t ?? ""}`}
              defaultTiers={startTiers}
              submitLabel={editing ? "Save rule" : "Apply rule"}
              currency={money.currency}
              locale={money.locale}
            />
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Products with a bundle rule">
        {groupList.length === 0 ? (
          <p className="text-sm text-slate-500">No product has a bundle rule yet.</p>
        ) : (
          <ul className="space-y-3">
            {groupList.map((g) => (
              <li key={tiersKey(g.tiers)} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <RuleChips tiers={g.tiers} />
                    <p className="text-sm text-slate-600">
                      <span className="font-medium text-slate-900">
                        {g.products.length} product{g.products.length === 1 ? "" : "s"}:
                      </span>{" "}
                      {g.products
                        .slice(0, 8)
                        .map((p) => p.name)
                        .join(", ")}
                      {g.products.length > 8 ? `, and ${g.products.length - 8} more` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={`${PAGE}?edit=${encodeURIComponent(g.products[0].id)}`} className={btnGhost}>
                      Edit
                    </Link>
                    <form action={removeBundleRule}>
                      {g.products.map((p) => (
                        <input key={p.id} type="hidden" name="ids" value={p.id} />
                      ))}
                      <button type="submit" className={btnDanger}>
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
