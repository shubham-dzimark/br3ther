"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/permissions";
import { applyProductCsv } from "@/lib/product-import";
import { EMPTY_RESULT, type ImportResult } from "@/lib/product-import-result";

/**
 * The upload handler: check who is asking, hand the file to the importer, and
 * let the shop's own pages know the catalogue moved.
 *
 * The work itself lives in lib/product-import.ts so it can be run against the
 * test database on its own. This is the one admin feature that writes to every
 * product at once, and that is not something to find out about in production.
 */
export async function importProducts(
  _prev: ImportResult,
  fd: FormData,
): Promise<ImportResult> {
  await requireCapability("catalog");

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ...EMPTY_RESULT, status: "error", message: "Choose a CSV file first." };
  }

  const result = await applyProductCsv(await file.text());

  revalidatePath("/admin/products");
  revalidatePath("/shop");

  return result;
}
