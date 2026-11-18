"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { parsePriceToCents } from "@/lib/money";
import { syncGiftProducts } from "@/lib/gifts";
import type { GiftReward, GiftTrigger } from "@/generated/prisma";

const LIST = "/admin/promotions/gifts";

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const bool = (fd: FormData, n: string) => fd.get(n) === "on";
/** Every value of a multi-select, once each, in the order picked. */
const ids = (fd: FormData, n: string) => [...new Set(fd.getAll(n).map(String).filter(Boolean))];

/** A whole number of at least 1, with no upper limit (blank or junk gives 1). */
function wholeFromOne(value: FormDataEntryValue | null): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

const TRIGGERS = ["CART_TOTAL", "BUY_X_GET_Y", "COUPON"] as const;
const REWARDS = ["PRODUCT", "CHEAPEST_IN_CART", "FREE_SHIPPING"] as const;

/** Which products count toward the offer: all, several products or several categories. */
const scopeOf = (fd: FormData, trigger: string) => (trigger === "COUPON" ? "all" : text(fd, "scope"));

function fields(fd: FormData) {
  const trigger = (TRIGGERS as readonly string[]).includes(text(fd, "trigger"))
    ? (text(fd, "trigger") as GiftTrigger)
    : "CART_TOTAL";
  const reward = (REWARDS as readonly string[]).includes(text(fd, "reward"))
    ? (text(fd, "reward") as GiftReward)
    : "PRODUCT";
  const scope = scopeOf(fd, trigger);

  return {
    name: text(fd, "name") || "Untitled offer",
    isEnabled: bool(fd, "isEnabled"),
    sortOrder: Number(fd.get("sortOrder")) || 0,
    trigger,
    minSubtotalCents: parsePriceToCents(text(fd, "minSubtotal")) ?? 0,
    // Minimum 1, no maximum: buying any quantity from 1 up can qualify.
    triggerQuantity: wholeFromOne(fd.get("triggerQuantity")),
    // The lists replace the single product/category older offers kept.
    triggerProductId: null,
    triggerCategoryId: null,
    triggerProductIds: scope === "products" ? ids(fd, "triggerProductIds") : [],
    triggerCategoryIds: scope === "categories" ? ids(fd, "triggerCategoryIds") : [],
    repeats: bool(fd, "repeats"),
    couponCode: text(fd, "couponCode").toUpperCase() || null,
    reward,
    // Gift quantity: any whole number from 1 up. Stock is the only limit.
    maxGifts: wholeFromOne(fd.get("maxGifts")),
    notice: text(fd, "notice") || null,
  };
}

/**
 * Why a rule could never hand anything out, or null when it is usable. Each of
 * these used to save silently, and the offer then simply never applied.
 */
function problemWith(fd: FormData, data: ReturnType<typeof fields>, variantIds: string[]): string | null {
  const scope = scopeOf(fd, data.trigger);
  if (data.trigger === "CART_TOTAL" && data.minSubtotalCents <= 0) return "spend";
  if (data.trigger === "COUPON" && !/^[A-Z0-9_-]{3,40}$/.test(data.couponCode ?? "")) return "code";
  if (scope === "products" && data.triggerProductIds.length === 0) return "products";
  if (scope === "categories" && data.triggerCategoryIds.length === 0) return "categories";
  if (data.reward === "PRODUCT" && variantIds.length === 0) return "gifts";
  if (data.reward === "CHEAPEST_IN_CART" && data.trigger === "BUY_X_GET_Y" && data.triggerQuantity < 2) {
    return "cheapest";
  }
  return null;
}

/** The one gift product of an offer - picking another in the form replaces it. */
const giftVariantIds = (fd: FormData, reward: string) =>
  reward === "PRODUCT" ? ids(fd, "giftVariantIds").slice(0, 1) : [];

export async function createGiftRule(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const data = fields(fd);
  const variantIds = giftVariantIds(fd, data.reward);
  const problem = problemWith(fd, data, variantIds);
  if (problem) redirect(`${LIST}/new?error=${problem}`);

  const rule = await prisma.giftRule.create({
    data: {
      ...data,
      gifts: { create: variantIds.map((variantId) => ({ variantId })) },
    },
  });
  // The gift product is now hidden from the storefront and badged in Products.
  await syncGiftProducts();

  revalidatePath(LIST);
  revalidatePath("/admin/products");
  revalidatePath("/", "layout");
  redirect(`${LIST}/${rule.id}?saved=1`);
}

export async function updateGiftRule(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = text(fd, "id");
  if (!id) redirect(LIST);

  const data = fields(fd);
  const variantIds = giftVariantIds(fd, data.reward);
  const problem = problemWith(fd, data, variantIds);
  if (problem) redirect(`${LIST}/${id}?error=${problem}`);

  await prisma.$transaction([
    prisma.giftRuleProduct.deleteMany({ where: { ruleId: id } }),
    prisma.giftRule.update({
      where: { id },
      data: {
        ...data,
        gifts: { create: variantIds.map((variantId) => ({ variantId })) },
      },
    }),
  ]);
  // A replaced gift goes back to being a normal product; the new one is hidden.
  await syncGiftProducts();

  /*
   * Gift lines in other shoppers' carts reconcile on their next read. Switched
   * off from the form, its gifts come out of carts now, as the toggle does.
   */
  if (!data.isEnabled) {
    await prisma.cartItem.deleteMany({ where: { giftRuleId: id } });
  }

  revalidatePath(LIST);
  revalidatePath("/admin/products");
  revalidatePath("/", "layout");
  redirect(`${LIST}/${id}?saved=1`);
}

export async function deleteGiftRule(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = text(fd, "id");
  if (id) {
    await prisma.giftRule.delete({ where: { id } });
    // Free lines granted by a rule that no longer exists would otherwise ship
    // for nothing; the cart clears them, but this makes it immediate.
    await prisma.cartItem.deleteMany({ where: { giftRuleId: id } });
    // Its gift product becomes a normal product again unless another offer uses it.
    await syncGiftProducts();
  }

  revalidatePath(LIST);
  revalidatePath("/admin/products");
  revalidatePath("/", "layout");
  redirect(`${LIST}?deleted=1`);
}

export async function toggleGiftRule(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = text(fd, "id");
  const rule = id ? await prisma.giftRule.findUnique({ where: { id } }) : null;
  if (rule) {
    await prisma.giftRule.update({
      where: { id },
      data: { isEnabled: !rule.isEnabled },
    });
    if (rule.isEnabled) {
      await prisma.cartItem.deleteMany({ where: { giftRuleId: id } });
    }
  }

  revalidatePath(LIST);
  revalidatePath("/", "layout");
  redirect(LIST);
}
