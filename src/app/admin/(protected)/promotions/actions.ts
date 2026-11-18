"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

import { requireCapability } from "@/lib/permissions";
import { syncDealPricing } from "@/lib/deals";
import { parsePriceToCents } from "@/lib/money";
import { getSettings, setSettings, SETTING_KEYS } from "@/lib/settings";
import { getTimeZone, fromLocalInput, zonedStart } from "@/lib/timezone";
import type { DealType, DiscountType } from "@/generated/prisma";

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Deal dates are whole days on the store's clock: a deal set to run
 * 10 Sep -> 17 Sep starts at midnight Pacific on the 10th and ends at the last
 * moment of the 17th. `new Date("2026-09-17")` read the value as UTC midnight,
 * which ended the deal (and its countdown) at 5pm Pacific the day before.
 */
async function dealWindow(fd: FormData): Promise<{ startsAt: Date | null; endsAt: Date | null }> {
  const tz = await getTimeZone();
  const endRaw = text(fd, "endsAt");
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endRaw);
  const endsAt = day
    ? new Date(zonedStart(tz, Number(day[1]), Number(day[2]), Number(day[3]) + 1).getTime() - 1)
    : fromLocalInput(endRaw, tz);
  return { startsAt: fromLocalInput(text(fd, "startsAt"), tz), endsAt };
}

/* ---------- Coupons ---------- */

/**
 * The usage limit chosen on the coupon form: unlimited, a total across
 * everyone, or a number of uses per customer (checked by email at checkout).
 * One limit at a time - the one not chosen is cleared. Null means the count
 * box was left empty or below 1 for a limit that needs it.
 */
function usageLimitFrom(fd: FormData): { maxRedemptions: number | null; maxPerCustomer: number | null } | null {
  const mode = text(fd, "usageLimit");
  const count = Math.floor(Number(text(fd, "usageCount")));
  if (mode === "total" || mode === "per_customer") {
    if (!Number.isFinite(count) || count < 1) return null;
    return mode === "total"
      ? { maxRedemptions: count, maxPerCustomer: null }
      : { maxRedemptions: null, maxPerCustomer: count };
  }
  return { maxRedemptions: null, maxPerCustomer: null };
}

export async function createCoupon(fd: FormData): Promise<void> {
  await requireCapability("promotions");

  const code = text(fd, "code").toUpperCase().replace(/\s+/g, "");
  const type = text(fd, "type") === "FIXED" ? "FIXED" : "PERCENT";
  if (!code) redirect("/admin/promotions/coupons?error=code");

  const rawValue = text(fd, "value");
  const value =
    type === "PERCENT"
      ? Math.round(Number(rawValue) || 0)
      : (parsePriceToCents(rawValue) ?? 0);

  if (value <= 0 || (type === "PERCENT" && value > 100)) {
    redirect("/admin/promotions/coupons?error=value");
  }

  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) redirect("/admin/promotions/coupons?error=duplicate");

  const usage = usageLimitFrom(fd);
  if (!usage) redirect("/admin/promotions/coupons?error=usage");

  await prisma.coupon.create({
    data: {
      code,
      description: text(fd, "description") || null,
      type: type as DiscountType,
      value,
      minSubtotalCents: parsePriceToCents(text(fd, "minSubtotal")) ?? 0,
      maxRedemptions: usage.maxRedemptions,
      maxPerCustomer: usage.maxPerCustomer,
      startsAt: parseDate(text(fd, "startsAt")),
      endsAt: parseDate(text(fd, "endsAt")),
      isActive: fd.get("isActive") === "on",
    },
  });

  revalidatePath("/admin/promotions/coupons");
  redirect("/admin/promotions/coupons?saved=1");
}

/**
 * Edit a coupon in place. The code itself stays as it is: past orders record
 * the code they used, and the per-customer limit counts those orders by code.
 */
export async function updateCoupon(fd: FormData): Promise<void> {
  await requireCapability("promotions");

  const id = text(fd, "id");
  if (!id) redirect("/admin/promotions/coupons");
  const back = `/admin/promotions/coupons/${id}`;

  const coupon = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!coupon) redirect("/admin/promotions/coupons?error=featured");

  const type = text(fd, "type") === "FIXED" ? "FIXED" : "PERCENT";
  const rawValue = text(fd, "value");
  const value =
    type === "PERCENT"
      ? Math.round(Number(rawValue) || 0)
      : (parsePriceToCents(rawValue) ?? 0);
  if (value <= 0 || (type === "PERCENT" && value > 100)) redirect(`${back}?error=value`);

  const usage = usageLimitFrom(fd);
  if (!usage) redirect(`${back}?error=usage`);

  await prisma.coupon.update({
    where: { id },
    data: {
      description: text(fd, "description") || null,
      type: type as DiscountType,
      value,
      minSubtotalCents: parsePriceToCents(text(fd, "minSubtotal")) ?? 0,
      maxRedemptions: usage.maxRedemptions,
      maxPerCustomer: usage.maxPerCustomer,
      startsAt: parseDate(text(fd, "startsAt")),
      endsAt: parseDate(text(fd, "endsAt")),
      isActive: fd.get("isActive") === "on",
    },
  });

  revalidatePath("/admin/promotions/coupons");
  revalidatePath("/", "layout");
  redirect(`${back}?saved=1`);
}

export async function toggleCoupon(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = String(fd.get("id") ?? "");
  const active = String(fd.get("active") ?? "") === "1";
  if (id) await prisma.coupon.update({ where: { id }, data: { isActive: active } });
  revalidatePath("/admin/promotions/coupons");
  redirect("/admin/promotions/coupons");
}

export async function deleteCoupon(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = String(fd.get("id") ?? "");
  if (id) await prisma.coupon.delete({ where: { id } }).catch(() => undefined);
  revalidatePath("/admin/promotions/coupons");
  redirect("/admin/promotions/coupons");
}

/* ---------- Deals (flash / featured / clearance) ---------- */

export async function createDeal(fd: FormData): Promise<void> {
  await requireCapability("promotions");

  const type = text(fd, "type") as DealType;
  const title = text(fd, "title");
  const back = `/admin/promotions/${text(fd, "back") || "coupons"}`;
  if (!title) redirect(`${back}?error=title`);

  const percentOff = Math.round(Number(text(fd, "percentOff")) || 0);
  if (percentOff < 0 || percentOff > 100) redirect(`${back}?error=percent`);

  const productIds = fd.getAll("productIds").map(String).filter(Boolean);

  await prisma.deal.create({
    data: {
      title,
      type,
      description: text(fd, "description") || null,
      percentOff,
      bannerImage: text(fd, "bannerImage") || null,
      ...(await dealWindow(fd)),
      isActive: fd.get("isActive") === "on",
      products: { create: productIds.map((productId) => ({ productId })) },
    },
  });

  await syncDealPricing();
  revalidatePath(back);
  revalidatePath("/", "layout");
  redirect(`${back}?saved=1`);
}

/** Edit an existing deal in place, including which products it covers. */
export async function updateDeal(fd: FormData): Promise<void> {
  await requireCapability("promotions");

  const id = text(fd, "id");
  const back = `/admin/promotions/${text(fd, "back") || "coupons"}`;
  if (!id) redirect(back);

  const title = text(fd, "title");
  if (!title) redirect(`${back}?edit=${id}&error=title`);

  const percentOff = Math.round(Number(text(fd, "percentOff")) || 0);
  if (percentOff < 0 || percentOff > 100) redirect(`${back}?edit=${id}&error=percent`);

  const productIds = fd.getAll("productIds").map(String).filter(Boolean);

  await prisma.deal.update({
    where: { id },
    data: {
      title,
      description: text(fd, "description") || null,
      percentOff,
      bannerImage: text(fd, "bannerImage") || null,
      ...(await dealWindow(fd)),
      isActive: fd.get("isActive") === "on",
      // Replace the set outright - simpler than diffing, and the join table
      // carries nothing worth preserving.
      products: {
        deleteMany: {},
        create: productIds.map((productId) => ({ productId })),
      },
    },
  });

  /*
   * Products dropped from the deal must lose the discount it gave them, which
   * syncDealPricing does by reverting anything still tagged with this deal.
   */
  await syncDealPricing();
  revalidatePath(back);
  revalidatePath("/", "layout");
  redirect(`${back}?saved=1`);
}

export async function toggleDeal(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = String(fd.get("id") ?? "");
  const active = String(fd.get("active") ?? "") === "1";
  const back = `/admin/promotions/${String(fd.get("back") ?? "coupons")}`;
  if (id) await prisma.deal.update({ where: { id }, data: { isActive: active } });
  await syncDealPricing();
  revalidatePath(back);
  revalidatePath("/", "layout");
  redirect(back);
}

export async function deleteDeal(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = String(fd.get("id") ?? "");
  const back = `/admin/promotions/${String(fd.get("back") ?? "coupons")}`;
  if (id) await prisma.deal.delete({ where: { id } }).catch(() => undefined);
  await syncDealPricing();
  revalidatePath(back);
  revalidatePath("/", "layout");
  redirect(back);
}

/** Featured deals also flip the product's own `featured` flag. */
export async function toggleProductFeatured(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = String(fd.get("id") ?? "");
  const featured = String(fd.get("featured") ?? "") === "1";
  if (id) await prisma.product.update({ where: { id }, data: { featured } });
  revalidatePath("/admin/promotions/featured");
  redirect("/admin/promotions/featured");
}

/** Feature one coupon on the cart and checkout (or none). */
export async function setFeaturedCoupon(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const code = text(fd, "featuredCode").toUpperCase();
  if (code) {
    const coupon = await prisma.coupon.findUnique({ where: { code }, select: { code: true } });
    if (!coupon) redirect("/admin/promotions/coupons?error=featured");
    const personal = ((await getSettings())[SETTING_KEYS.promoPopupCoupon] ?? "").trim().toUpperCase();
    if (personal && personal === code) redirect("/admin/promotions/coupons?error=personal");
  }
  await setSettings({ [SETTING_KEYS.checkoutFeaturedCoupon]: code });
  revalidatePath("/admin/promotions/coupons");
  revalidatePath("/cart");
  revalidatePath("/checkout");
  redirect("/admin/promotions/coupons?saved=featured");
}
