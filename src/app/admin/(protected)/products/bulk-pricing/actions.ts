"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/permissions";
import { applyPriceChange, parsePriceChange, parseScope, restoreOriginalPrices } from "@/lib/bulk-pricing";

const PAGE = "/admin/products/bulk-pricing";

const reader = (fd: FormData) => (field: string) => String(fd.get(field) ?? "").trim();

/** Keeps the scope in the URL so the page comes back where the admin was. */
function scopeParams(get: (field: string) => string): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ["scope", "category", "ids"]) if (get(key)) params.set(key, get(key));
  return params;
}

export async function applyBulkPrices(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const get = reader(fd);
  const params = scopeParams(get);

  const parsed = parsePriceChange(get);
  if ("error" in parsed) {
    params.set("error", parsed.error);
    redirect(`${PAGE}?${params}`);
  }

  const summary = await applyPriceChange(parseScope(get), parsed.change);

  // Prices show on every storefront listing, the cart and checkout.
  revalidatePath("/", "layout");
  revalidatePath("/admin/products");
  params.set("done", "1");
  params.set("n", String(summary.variants - summary.skipped));
  params.set("p", String(summary.products));
  params.set("skipped", String(summary.skipped));
  redirect(`${PAGE}?${params}`);
}

export async function restoreBulkPrices(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const get = reader(fd);
  const params = scopeParams(get);
  const restored = await restoreOriginalPrices(parseScope(get));
  revalidatePath("/", "layout");
  revalidatePath("/admin/products");
  params.set("restored", String(restored));
  redirect(`${PAGE}?${params}`);
}
