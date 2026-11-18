import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

/*
 * The shop's own order for categories, set by dragging on the Categories
 * screen.
 *
 * New categories were never given a position, so they all sat at 0. Asked for
 * "position first", the database then broke that tie however it liked - and
 * saving a category shifts where the database keeps the row, so adding or
 * editing one moved categories around the storefront. Meanwhile the
 * Categories screen, the shop sidebar and the footer sorted by name, so the
 * backend and the storefront never agreed.
 *
 * Every list of categories the shop shows now reads this one order. The name
 * and then the id break any remaining tie, so the order is total and cannot
 * drift. Editing a category never changes its position.
 */
export const CATEGORY_ORDER: Prisma.CategoryOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { name: "asc" },
  { id: "asc" },
];

/** Where a new category goes: after everything already placed. */
export async function nextCategorySortOrder(): Promise<number> {
  const last = await prisma.category.aggregate({ _max: { sortOrder: true } });
  return (last._max.sortOrder ?? 0) + 1;
}
