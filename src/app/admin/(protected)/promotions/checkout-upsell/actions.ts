"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { parsePriceToCents } from "@/lib/money";
import { asPlacement, formatUpsellDiscount } from "@/lib/checkout-upsell";
import { setSettings, SETTING_KEYS } from "@/lib/settings";
import { getTimeZone, fromLocalInput } from "@/lib/timezone";

/*
 * Checkout Upsell offers: what the checkout block shows on top of the
 * companions set on a product screen ("Checkout Upsell Product"). An offer can
 * target every basket, a basket holding one of its trigger products, a basket
 * holding something from a trigger category, and/or a minimum basket total.
 */

const PAGE = "/admin/promotions/checkout-upsell";
const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const idsOf = (fd: FormData, n: string) =>
  [...new Set(fd.getAll(n).map((v) => String(v).trim()).filter(Boolean))];

/*
 * The discount an offer takes off each item it shows: a percentage, a fixed
 * amount, or nothing. It lives in one column - the choice and the number
 * together - so the two can never disagree about which applies.
 */
function discountRule(fd: FormData): string {
  const kind = text(fd, "discountKind");
  const typed = text(fd, "discountValue");
  if (kind === "percent") {
    const pct = Math.max(0, Math.min(90, Math.round(Number(typed) || 0)));
    return formatUpsellDiscount(pct > 0 ? { kind: "percent", value: pct } : null);
  }
  if (kind === "fixed") {
    const cents = Math.max(0, parsePriceToCents(typed) || 0);
    return formatUpsellDiscount(cents > 0 ? { kind: "fixed", value: cents } : null);
  }
  return "";
}

/*
 * Who the offer is shown to, as one choice: every basket, baskets holding
 * chosen products, or baskets holding something from chosen categories. The
 * unused side is cleared, so a switched mode never leaves a stale trigger
 * behind to widen the offer silently.
 */
function targeting(fd: FormData) {
  const mode = text(fd, "showTo") || "all";
  const products = mode === "products" ? idsOf(fd, "triggerProductIds") : [];
  const categories = mode === "category" ? idsOf(fd, "triggerCategoryIds") : [];
  return { mode, allCarts: mode === "all", triggerProducts: products, triggerCategories: categories };
}

async function offerFields(fd: FormData) {
  const tz = await getTimeZone();
  const minSubtotalCents = Math.max(0, parsePriceToCents(text(fd, "minSubtotal")) || 0);
  return {
    name: text(fd, "name").slice(0, 120),
    isActive: fd.get("isActive") === "on",
    minSubtotalCents,
    discountRule: discountRule(fd),
    sortOrder: Math.max(0, Number(fd.get("sortOrder")) || 0),
    placement: asPlacement(text(fd, "placement")),
    priority: Math.max(0, Math.min(100, Math.round(Number(fd.get("priority") ?? 10)))),
    couponValidDays: Math.max(1, Math.min(365, Math.round(Number(fd.get("couponValidDays")) || 30))),
    couponMinSpendCents: Math.max(0, parsePriceToCents(text(fd, "couponMinSpend")) || 0),
    startsAt: fromLocalInput(text(fd, "startsAt"), tz),
    endsAt: fromLocalInput(text(fd, "endsAt"), tz),
  };
}

/** "Percent off" or "Amount off" chosen but left blank saves a discount of nothing. */
function discountError(fd: FormData, fields: { discountRule: string }) {
  const kind = text(fd, "discountKind");
  return (kind === "percent" || kind === "fixed") && !fields.discountRule;
}

/** A chosen rule with nothing picked would never show; say so rather than saving it. */
function targetingError(mode: string, triggerProducts: string[], triggerCategories: string[]) {
  if (mode === "products" && triggerProducts.length === 0) return "triggerProducts";
  if (mode === "category" && triggerCategories.length === 0) return "triggerCategories";
  return null;
}

export async function createUpsellOffer(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const fields = await offerFields(fd);
  const products = idsOf(fd, "productIds");
  const { mode, allCarts, triggerProducts, triggerCategories } = targeting(fd);

  if (!fields.name) redirect(`${PAGE}?error=name`);
  if (products.length === 0 && fields.placement !== "NEXT_ORDER") redirect(`${PAGE}?error=products`);
  if (fields.placement === "NEXT_ORDER" && !fields.discountRule) redirect(`${PAGE}?error=coupon`);
  if (discountError(fd, fields)) redirect(`${PAGE}?error=discount`);
  const bad = targetingError(mode, triggerProducts, triggerCategories);
  if (bad) redirect(`${PAGE}?error=${bad}`);

  await prisma.checkoutUpsellOffer.create({
    data: {
      ...fields,
      allCarts,
      products: { connect: products.map((id) => ({ id })) },
      triggerProducts: { connect: triggerProducts.map((id) => ({ id })) },
      triggerCategories: { connect: triggerCategories.map((id) => ({ id })) },
    },
  });

  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}

export async function updateUpsellOffer(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = text(fd, "id");
  if (!id) redirect(PAGE);
  const fields = await offerFields(fd);
  const products = idsOf(fd, "productIds");
  const { mode, allCarts, triggerProducts, triggerCategories } = targeting(fd);

  if (!fields.name) redirect(`${PAGE}/${id}?error=name`);
  if (products.length === 0 && fields.placement !== "NEXT_ORDER") redirect(`${PAGE}/${id}?error=products`);
  if (fields.placement === "NEXT_ORDER" && !fields.discountRule) redirect(`${PAGE}/${id}?error=coupon`);
  if (discountError(fd, fields)) redirect(`${PAGE}/${id}?error=discount`);
  const bad = targetingError(mode, triggerProducts, triggerCategories);
  if (bad) redirect(`${PAGE}/${id}?error=${bad}`);

  await prisma.checkoutUpsellOffer.update({
    where: { id },
    data: {
      ...fields,
      allCarts,
      // Replace the whole set rather than diffing - an offer holds a handful.
      products: { set: products.map((p) => ({ id: p })) },
      triggerProducts: { set: triggerProducts.map((p) => ({ id: p })) },
      triggerCategories: { set: triggerCategories.map((c) => ({ id: c })) },
    },
  });

  revalidatePath(PAGE);
  redirect(`${PAGE}/${id}?saved=1`);
}

export async function toggleUpsellOffer(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = text(fd, "id");
  if (id) {
    await prisma.checkoutUpsellOffer.update({
      where: { id },
      data: { isActive: text(fd, "active") === "1" },
    });
  }
  revalidatePath(PAGE);
  redirect(PAGE);
}

/** A paused copy of a campaign, to start a variation from. Its numbers start at zero. */
export async function duplicateUpsellOffer(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = text(fd, "id");
  const src = id
    ? await prisma.checkoutUpsellOffer.findUnique({
        where: { id },
        include: { products: { select: { id: true } }, triggerProducts: { select: { id: true } }, triggerCategories: { select: { id: true } } },
      })
    : null;
  if (!src) redirect(PAGE);
  await prisma.checkoutUpsellOffer.create({
    data: {
      name: `${src.name} (copy)`.slice(0, 120),
      isActive: false,
      sortOrder: src.sortOrder,
      allCarts: src.allCarts,
      minSubtotalCents: src.minSubtotalCents,
      discountRule: src.discountRule,
      startsAt: src.startsAt,
      endsAt: src.endsAt,
      placement: src.placement,
      priority: src.priority,
      couponValidDays: src.couponValidDays,
      couponMinSpendCents: src.couponMinSpendCents,
      products: { connect: src.products },
      triggerProducts: { connect: src.triggerProducts },
      triggerCategories: { connect: src.triggerCategories },
    },
  });
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=duplicate`);
}

/**
 * Delete an offer. Sales already attributed to it keep their order lines - the
 * link is nulled, so past revenue stays in the report as an upsell sale.
 */
export async function deleteUpsellOffer(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = text(fd, "id");
  if (id) await prisma.checkoutUpsellOffer.delete({ where: { id } }).catch(() => undefined);
  revalidatePath(PAGE);
  redirect(`${PAGE}?deleted=1`);
}

/** The heading over the block on the checkout. */
export async function saveUpsellTitle(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  await setSettings({
    [SETTING_KEYS.checkoutUpsellTitle]: text(fd, "title").slice(0, 80),
  });
  revalidatePath(PAGE);
  revalidatePath("/checkout");
  redirect(`${PAGE}?saved=title`);
}
