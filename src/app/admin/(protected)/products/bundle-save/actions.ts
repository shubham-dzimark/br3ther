"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { parseTiersForm, tierProblems } from "@/lib/quantity-tiers";

const PAGE = "/admin/products/bundle-save";
const MAX_IDS = 1000;

const idsFrom = (fd: FormData, field: string) =>
  [...new Set(fd.getAll(field).map(String).map((s) => s.trim()).filter(Boolean))].slice(0, MAX_IDS);

/** Saves one rule on every chosen product, replacing whatever rule they had. */
export async function applyBundleRule(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const tiers = parseTiersForm((k) => String(fd.get(k) ?? ""));
  const scope = String(fd.get("scope") ?? "products");
  const category = String(fd.get("category") ?? "").trim();
  const productIds = idsFrom(fd, "productIds");

  // Back to the form with what the admin had entered.
  const back = (error: string): never => {
    const params = new URLSearchParams({ error, scope, t: JSON.stringify(tiers) });
    if (category) params.set("category", category);
    if (productIds.length) params.set("ids", productIds.join(","));
    redirect(`${PAGE}?${params}`);
  };

  if (!tiers.some((t) => t.percent > 0)) back("Add at least one row with a quantity of 2 or more and a discount.");
  const problems = tierProblems(tiers);
  if (problems.length) back(problems[0]);

  let where: Prisma.ProductWhereInput;
  if (scope === "category") {
    if (!category) back("Choose a category.");
    where = { OR: [{ categoryId: category }, { categories: { some: { id: category } } }] };
  } else if (scope === "all") {
    where = {};
  } else {
    if (productIds.length === 0) back("Choose at least one product.");
    where = { id: { in: productIds } };
  }

  const { count } = await prisma.product.updateMany({
    where: { AND: [where, { type: { not: "EXTERNAL" } }] },
    data: { quantityTiers: tiers },
  });

  // Tier prices show on product pages, the cart and checkout.
  revalidatePath("/", "layout");
  revalidatePath("/admin/products");
  // Keep what "Apply to" was set to, so the form doesn't jump back to
  // "Selected products" after saving on a category or the whole store.
  const params = new URLSearchParams({ done: String(count), scope: scope === "category" || scope === "all" ? scope : "products" });
  if (scope === "category" && category) params.set("category", category);
  if (scope === "products" && productIds.length) params.set("ids", productIds.join(","));
  redirect(`${PAGE}?${params}`);
}

/** Takes the rule off a group of products. */
export async function removeBundleRule(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const ids = idsFrom(fd, "ids");
  if (ids.length === 0) redirect(PAGE);
  const { count } = await prisma.product.updateMany({
    where: { id: { in: ids } },
    data: { quantityTiers: Prisma.DbNull },
  });
  revalidatePath("/", "layout");
  revalidatePath("/admin/products");
  redirect(`${PAGE}?removed=${count}`);
}
