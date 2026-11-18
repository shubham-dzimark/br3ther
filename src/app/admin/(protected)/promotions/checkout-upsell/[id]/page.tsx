import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";
import { getTimeZone, toLocalInput } from "@/lib/timezone";
import { Card, btnPrimary } from "@/components/admin/ui";
import { Field, fieldInput } from "@/components/admin/Field";
import { ProductPicker } from "@/components/admin/ProductPicker";
import { centsToInput } from "@/lib/money";
import { parseUpsellDiscount } from "@/lib/checkout-upsell";
import { DiscountField } from "@/components/admin/DiscountField";
import { UpsellTargeting, type UpsellMode } from "@/components/admin/UpsellTargeting";
import { campaignStats } from "@/lib/upsell-campaigns";
import { CampaignTypeFields } from "@/components/admin/CampaignTypeFields";
import { updateUpsellOffer } from "../actions";

export const metadata: Metadata = { title: "Edit campaign" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "Give the campaign a name so you can recognise it here.",
  products: "Choose at least one product to offer.",
  triggerProducts: "Choose the products whose baskets should see this offer.",
  triggerCategories: "Choose the categories whose baskets should see this offer.",
  discount: "Fill in the discount amount, or set the type back to “No discount”.",
  coupon: "A next-order campaign needs a discount: choose percent or amount off and fill it in.",
};

export default async function EditUpsellOfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapability("promotions");
  const [{ id }, { saved, error }, products, categories, money, tz, stats] = await Promise.all([
    params,
    searchParams,
    prisma.product.findMany({
      where: { isGiftOnly: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getMoneyFormatter(),
    getTimeZone(),
    campaignStats(),
  ]);

  const offer = await prisma.checkoutUpsellOffer.findUnique({
    where: { id },
    include: {
      products: { select: { id: true } },
      triggerProducts: { select: { id: true } },
      triggerCategories: { select: { id: true } },
    },
  });
  if (!offer) notFound();

  // The choice and the number come out of the offer's single discount column.
  const discount = parseUpsellDiscount(offer.discountRule);
  /* An offer saved before this became one choice could carry both; the
     trigger it actually holds wins, so nothing widens on the next save. */
  const mode: UpsellMode = offer.allCarts
    ? "all"
    : offer.triggerCategories.length > 0
      ? "category"
      : "products";

  const pickerOptions = products.map((p) => ({
    id: p.id,
    name: p.name,
    note: p.status === "PUBLISHED" ? null : "Draft",
  }));
  const sales = stats.get(offer.id);
  const nextOrder = offer.placement === "NEXT_ORDER";
  const chosenCategories = new Set(offer.triggerCategories.map((c) => c.id));

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/promotions/checkout-upsell"
          aria-label="Back to campaigns"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{offer.name}</h1>
      </div>

      {saved ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {ERRORS[error] ?? "Something went wrong."}
        </p>
      ) : null}

      <Card className="p-6">
        <p className="text-sm text-slate-500">
          {nextOrder
            ? `Issued ${sales?.views ?? 0} coupon${(sales?.views ?? 0) === 1 ? "" : "s"}, used in ${sales?.orders ?? 0} order${(sales?.orders ?? 0) === 1 ? "" : "s"}, worth `
            : `Shown ${sales?.views ?? 0} time${(sales?.views ?? 0) === 1 ? "" : "s"}. Sold ${sales?.units ?? 0} item${(sales?.units ?? 0) === 1 ? "" : "s"} in ${sales?.orders ?? 0} order${(sales?.orders ?? 0) === 1 ? "" : "s"}, worth `}
          <span title={money.format(sales?.revenueCents ?? 0)} className="font-semibold text-slate-900">
            {money.compact(sales?.revenueCents ?? 0)}
          </span>{" "}
          (confirmed payments, all time).
        </p>
      </Card>

      <Card className="p-6">
        <form action={updateUpsellOffer} className="space-y-7" data-upsell-edit-form>
          <input type="hidden" name="id" value={offer.id} />

          <Field label="Campaign name" htmlFor="name">
            <input id="name" name="name" required defaultValue={offer.name} className={fieldInput} />
          </Field>

          <CampaignTypeFields
            defaultPlacement={offer.placement}
            defaultPriority={offer.priority}
            defaultValidDays={offer.couponValidDays}
            defaultMinSpend={offer.couponMinSpendCents > 0 ? centsToInput(offer.couponMinSpendCents) : ""}
          />

          <UpsellTargeting
            defaultMode={mode}
            productOptions={pickerOptions}
            defaultProductIds={offer.triggerProducts.map((p) => p.id)}
            categories={categories}
            defaultCategoryIds={[...chosenCategories]}
          />

          <div>
            <p className="mb-2 px-5 text-sm font-medium text-slate-700">Products to offer</p>
            <p className="mb-2 px-5 text-xs text-slate-500">Not needed for Next Order Coupons.</p>
            <ProductPicker
              name="productIds"
              options={pickerOptions}
              defaultValue={offer.products.map((p) => p.id)}
              minChars={1}
            />
          </div>

          <DiscountField
            defaultKind={discount?.kind ?? "none"}
            defaultValue={
              discount
                ? discount.kind === "fixed"
                  ? centsToInput(discount.value)
                  : String(discount.value)
                : ""
            }
          />

          <Field label="Minimum basket total" htmlFor="minSubtotal">
            <input
              id="minSubtotal"
              name="minSubtotal"
              inputMode="decimal"
              defaultValue={offer.minSubtotalCents > 0 ? centsToInput(offer.minSubtotalCents) : ""}
              placeholder="0.00"
              className={fieldInput}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts" htmlFor="startsAt">
              <input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                defaultValue={offer.startsAt ? toLocalInput(offer.startsAt, tz) : ""}
                className={fieldInput}
              />
            </Field>
            <Field label="Ends" htmlFor="endsAt">
              <input
                id="endsAt"
                name="endsAt"
                type="datetime-local"
                defaultValue={offer.endsAt ? toLocalInput(offer.endsAt, tz) : ""}
                className={fieldInput}
              />
            </Field>
          </div>

          <Field label="Order in the block" htmlFor="sortOrder">
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              min="0"
              defaultValue={offer.sortOrder}
              className={fieldInput}
            />
          </Field>

          <label className="flex items-center gap-3 px-5 text-sm text-slate-700">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={offer.isActive}
              className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
            />
            Active
          </label>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              href="/admin/promotions/checkout-upsell"
              className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button type="submit" className={btnPrimary}>
              Save campaign
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
