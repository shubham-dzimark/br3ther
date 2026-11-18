import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getTimeZone, ymd } from "@/lib/timezone";
import { Card, btnPrimary } from "@/components/admin/ui";
import { Field, fieldInput } from "@/components/admin/Field";
import { DiscountField } from "@/components/admin/DiscountField";
import { UpsellTargeting } from "@/components/admin/UpsellTargeting";
import { ProductPicker } from "@/components/admin/ProductPicker";
import { CampaignTypeFields } from "@/components/admin/CampaignTypeFields";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { IconPencil, IconTrash } from "@/components/admin/Icons";
import { asPlacement, PLACEMENT_LABELS, PLACEMENTS, UPSELL_TITLE_FALLBACK, type Placement } from "@/lib/checkout-upsell";
import { campaignStats } from "@/lib/upsell-campaigns";
import { createUpsellOffer, deleteUpsellOffer, duplicateUpsellOffer, saveUpsellTitle, toggleUpsellOffer } from "./actions";

export const metadata: Metadata = { title: "Upsell Campaigns" };
export const dynamic = "force-dynamic";

const PAGE = "/admin/promotions/checkout-upsell";

const ERRORS: Record<string, string> = {
  name: "Give the campaign a name so you can recognise it here.",
  products: "Choose at least one product to offer.",
  triggerProducts: "Choose the products whose baskets should see this campaign.",
  triggerCategories: "Choose the categories whose baskets should see this campaign.",
  discount: "Fill in the discount amount, or set the type back to “No discount”.",
  coupon: "A next-order campaign needs a discount: choose percent or amount off and fill it in.",
};

const SAVED: Record<string, string> = {
  "1": "Campaign saved.",
  title: "Heading saved.",
  duplicate: "Campaign duplicated. The copy is paused until you switch it on.",
};

/** Badge colours per type, readable in light and dark admin. */
const TYPE_TONE: Record<Placement, string> = {
  CHECKOUT: "bg-[#DEEAF4] text-[#1C5A8A] [[data-scheme=dark]_&]:bg-[#7DB4E0]/15 [[data-scheme=dark]_&]:text-[#9CC8EC]",
  CART: "bg-[#E2EEEA] text-[#1F6B52] [[data-scheme=dark]_&]:bg-[#6FCBA6]/15 [[data-scheme=dark]_&]:text-[#8ED9BA]",
  THANK_YOU: "bg-[#F5EDDA] text-[#8A6212] [[data-scheme=dark]_&]:bg-[#E3B860]/15 [[data-scheme=dark]_&]:text-[#EBC77F]",
  NEXT_ORDER: "bg-[#F4E2E8] text-[#8E3557] [[data-scheme=dark]_&]:bg-[#E58FB0]/15 [[data-scheme=dark]_&]:text-[#EFA9C3]",
};

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; status?: string; type?: string; q?: string }>;
}) {
  await requireCapability("promotions");
  const sp = await searchParams;
  const status = sp.status === "active" || sp.status === "paused" ? sp.status : "all";
  const type = PLACEMENTS.includes(sp.type as Placement) ? (sp.type as Placement) : null;
  const q = (sp.q ?? "").trim();

  const [all, products, categories, money, settings, tz, stats] = await Promise.all([
    prisma.checkoutUpsellOffer.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true, isActive: true, placement: true, priority: true, createdAt: true, startsAt: true, endsAt: true, _count: { select: { products: true } } },
    }),
    prisma.product.findMany({ where: { isGiftOnly: false }, orderBy: { name: "asc" }, select: { id: true, name: true, status: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getMoneyFormatter(),
    getSettings(),
    getTimeZone(),
    campaignStats(),
  ]);

  const counts = { all: all.length, active: all.filter((c) => c.isActive).length, paused: all.filter((c) => !c.isActive).length };
  const shown = all.filter(
    (c) =>
      (status === "all" || (status === "active" ? c.isActive : !c.isActive)) &&
      (!type || c.placement === type) &&
      (!q || c.name.toLowerCase().includes(q.toLowerCase())),
  );
  const totals = [...stats.values()].reduce((t, s) => ({ views: t.views + s.views, revenue: t.revenue + s.revenueCents, orders: t.orders + s.orders }), { views: 0, revenue: 0, orders: 0 });
  const pickerOptions = products.map((p) => ({ id: p.id, name: p.name, note: p.status === "PUBLISHED" ? null : "Draft" }));
  const title = settings[SETTING_KEYS.checkoutUpsellTitle]?.trim() || UPSELL_TITLE_FALLBACK;
  const now = new Date();
  const href = (over: { status?: string; type?: string | null }) => {
    const params = new URLSearchParams();
    const st = over.status ?? status;
    const ty = over.type === undefined ? type : over.type;
    if (st !== "all") params.set("status", st);
    if (ty) params.set("type", ty);
    if (q) params.set("q", q);
    const qs = params.toString();
    return `${PAGE}${qs ? `?${qs}` : ""}`;
  };
  const chip = (on: boolean) =>
    `rounded-[var(--admin-radius-sm)] border px-4 py-2 text-sm font-medium transition ${
      on ? "border-[var(--admin-btn)] bg-[var(--admin-btn)] text-[var(--admin-btn-ink)]" : "border-[var(--admin-line-strong)] text-slate-600 hover:text-slate-900"
    }`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="adm-display text-2xl font-semibold text-slate-900">Campaigns</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Upsells on the checkout, the cart and the thank-you page, and personal coupons for the next order, with what each one has earned.
          </p>
        </div>
        <a href="#new-campaign" className={btnPrimary}>
          + Create new campaign
        </a>
      </div>

      {sp.saved && SAVED[sp.saved] ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{SAVED[sp.saved]}</p>
      ) : null}
      {sp.deleted ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Campaign deleted. Sales it already made are kept in the totals.</p>
      ) : null}
      {sp.error ? (
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{ERRORS[sp.error] ?? "Something went wrong."}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Campaign revenue (all time)", value: money.format(totals.revenue) },
          { label: "Orders from campaigns", value: String(totals.orders) },
          { label: "Views and coupons issued", value: totals.views.toLocaleString() },
        ].map((t) => (
          <Card key={t.label} className="p-5">
            <p className="text-sm text-slate-500">{t.label}</p>
            <p className="adm-display mt-2 text-xl font-semibold text-slate-900">{t.value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--admin-line)] px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <Link href={href({ status: "all" })} className={chip(status === "all")}>All ({counts.all})</Link>
            <Link href={href({ status: "active" })} className={chip(status === "active")}>Active ({counts.active})</Link>
            <Link href={href({ status: "paused" })} className={chip(status === "paused")}>Paused ({counts.paused})</Link>
          </div>
          <form action={PAGE} className="flex flex-wrap items-center gap-2">
            {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
            <select name="type" defaultValue={type ?? ""} aria-label="Campaign type" className={`${fieldInput} !w-auto !py-2`}>
              <option value="">All types</option>
              {PLACEMENTS.map((p) => (
                <option key={p} value={p}>{PLACEMENT_LABELS[p]}</option>
              ))}
            </select>
            <input name="q" defaultValue={q} placeholder="Search campaign" aria-label="Search campaign" className={`${fieldInput} !w-52 !py-2`} />
            <button type="submit" className="rounded-[var(--admin-radius-sm)] border border-[var(--admin-line-strong)] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-[var(--admin-inset)]">Filter</button>
          </form>
        </div>

        {shown.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-slate-500">
            {all.length === 0 ? "No campaigns yet. Create one below." : "No campaigns match this filter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-[var(--admin-line)] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-5 py-3">Campaign</th>
                  <th className="px-3 py-3 text-right">Views</th>
                  <th className="px-3 py-3 text-right">Orders</th>
                  <th className="px-3 py-3 text-right">Revenue</th>
                  <th className="px-3 py-3">Created on</th>
                  <th className="px-3 py-3 text-center">Priority</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const placement = asPlacement(c.placement);
                  const s = stats.get(c.id) ?? { views: 0, orders: 0, revenueCents: 0, units: 0 };
                  const scheduled = c.startsAt && c.startsAt > now ? `Starts ${ymd(c.startsAt, tz)}` : c.endsAt && c.endsAt < now ? "Ended" : null;
                  return (
                    <tr key={c.id} className="border-b border-[var(--admin-line)] last:border-0">
                      <td className="px-5 py-4">
                        <Link href={`${PAGE}/${c.id}`} className="font-semibold text-slate-900 hover:underline">{c.name}</Link>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${TYPE_TONE[placement]}`}>{PLACEMENT_LABELS[placement]}</span>
                          {placement !== "NEXT_ORDER" ? <span className="text-xs text-slate-500">{c._count.products} product{c._count.products === 1 ? "" : "s"}</span> : null}
                          {scheduled ? <span className="text-xs text-amber-700">{scheduled}</span> : null}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-right tabular-nums text-slate-700" title={placement === "NEXT_ORDER" ? "Coupons issued" : "Times shown"}>{s.views.toLocaleString()}</td>
                      <td className="px-3 py-4 text-right tabular-nums text-slate-700">{s.orders}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-right font-semibold tabular-nums text-slate-900">{money.format(s.revenueCents)}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-slate-600">{ymd(c.createdAt, tz)}</td>
                      <td className="px-3 py-4 text-center tabular-nums text-slate-700">{c.priority}</td>
                      <td className="px-3 py-4">
                        <form action={toggleUpsellOffer}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="active" value={c.isActive ? "0" : "1"} />
                          <button type="submit" aria-label={c.isActive ? `Pause ${c.name}` : `Activate ${c.name}`} className="flex items-center gap-2.5">
                            <span className={`relative h-6 w-11 rounded-full transition ${c.isActive ? "bg-[var(--admin-accent)]" : "bg-slate-300"}`}>
                              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${c.isActive ? "left-[22px]" : "left-0.5"}`} />
                            </span>
                            <span className="text-sm font-medium text-slate-700">{c.isActive ? "Active" : "Paused"}</span>
                          </button>
                        </form>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`${PAGE}/${c.id}`} className="inline-flex items-center gap-1.5 rounded-[var(--admin-radius-sm)] border border-[var(--admin-line-strong)] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[var(--admin-inset)]">
                            <IconPencil className="h-3.5 w-3.5" /> Edit
                          </Link>
                          <form action={duplicateUpsellOffer}>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="rounded-[var(--admin-radius-sm)] border border-[var(--admin-line-strong)] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[var(--admin-inset)]">Duplicate</button>
                          </form>
                          <form action={deleteUpsellOffer}>
                            <input type="hidden" name="id" value={c.id} />
                            <ConfirmSubmit message={`Delete "${c.name}"? Sales it already made stay in the totals.`} title="Delete" className="flex h-8 w-8 items-center justify-center rounded-[var(--admin-radius-sm)] text-slate-400 hover:bg-red-50 hover:text-red-600">
                              <IconTrash className="h-4 w-4" />
                            </ConfirmSubmit>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-[var(--admin-line)] px-5 py-3 text-xs text-slate-500">
          Revenue counts confirmed payments only: items added from a campaign, or for next-order coupons the orders that used one. Views count how often a campaign was shown, or how many coupons it issued.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2" >
          <h2 id="new-campaign" className="mb-6 scroll-mt-24 text-lg font-semibold text-slate-900">New campaign</h2>
          <form action={createUpsellOffer} className="space-y-7">
            <Field label="Campaign name" htmlFor="name">
              <input id="name" name="name" required placeholder="Thank you add-ons" className={fieldInput} />
            </Field>

            <CampaignTypeFields />

            <UpsellTargeting defaultMode="all" productOptions={pickerOptions} categories={categories} />

            <div>
              <p className="mb-2 px-5 text-sm font-medium text-slate-700">Products to offer</p>
              <p className="mb-2 px-5 text-xs text-slate-500">Not needed for Next Order Coupons.</p>
              <ProductPicker name="productIds" options={pickerOptions} minChars={1} placeholder="Type a product name…" />
            </div>

            <DiscountField defaultKind="none" />

            <Field label="Minimum basket total" htmlFor="minSubtotal">
              <input id="minSubtotal" name="minSubtotal" inputMode="decimal" placeholder="0.00" className={fieldInput} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Starts" htmlFor="startsAt">
                <input id="startsAt" name="startsAt" type="datetime-local" className={fieldInput} />
              </Field>
              <Field label="Ends" htmlFor="endsAt">
                <input id="endsAt" name="endsAt" type="datetime-local" className={fieldInput} />
              </Field>
            </div>

            <label className="flex items-center gap-3 px-5 text-sm text-slate-700">
              <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]" />
              Active
            </label>

            <button type="submit" className={btnPrimary}>Create campaign</button>
          </form>
        </Card>

        <Card className="h-fit p-6">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Upsell block heading</h2>
          <p className="mb-5 text-xs text-slate-500">Shown above the offers on the checkout and cart pages.</p>
          <form action={saveUpsellTitle} className="space-y-5">
            <Field label="Heading" htmlFor="title">
              <input id="title" name="title" defaultValue={title} maxLength={80} className={fieldInput} />
            </Field>
            <button type="submit" className={btnPrimary}>Save heading</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
