"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { CATEGORY_ORDER, nextCategorySortOrder } from "@/lib/category-order";

import { requireCapability } from "@/lib/permissions";
import { slugify } from "@/lib/slug";

/**
 * Resolve the submitted parent, refusing anything that would make a loop.
 * A category cannot be its own parent, nor sit under one of its own
 * descendants - either would make the tree unwalkable.
 */
async function resolveParent(
  formData: FormData,
  selfId?: string,
): Promise<string | null> {
  const parentId = String(formData.get("parentId") ?? "").trim();
  if (!parentId) return null;
  if (selfId && parentId === selfId) return null;

  if (selfId) {
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === selfId) return null; // would close a cycle
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const row: { parentId: string | null } | null =
        await prisma.category.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = row?.parentId ?? null;
    }
  }

  return parentId;
}


/*
 * The colour comes from two inputs - a swatch and a text box - so that it can
 * be cleared. The text box wins when it holds anything, because that is where
 * someone types or pastes; only a #rrggbb value is accepted.
 */
function categoryColour(fd: FormData): string | null {
  const typed = String(fd.get("bgColourText") ?? "").trim();
  const picked = String(fd.get("bgColour") ?? "").trim();
  const value = typed || picked;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : null;
}

export async function createCategory(formData: FormData): Promise<void> {
  await requireCapability("catalog");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/admin/categories");

  let slug = slugify(String(formData.get("slug") ?? "") || name);
  let n = 1;
  while (await prisma.category.findUnique({ where: { slug }, select: { id: true } })) {
    n += 1;
    slug = `${slugify(name)}-${n}`;
  }

  await prisma.category.create({
    data: {
      // After every category already placed; drag it on the list to move it.
      sortOrder: await nextCategorySortOrder(),
      name,
      slug,
      description: String(formData.get("description") ?? "") || null,
      imageUrl: String(formData.get("imageUrl") ?? "") || null,
      subtitle: String(formData.get("subtitle") ?? "").trim() || null,
      bgColour: categoryColour(formData),
      seoTitle: String(formData.get("seoTitle") ?? "").trim() || null,
      seoDescription: String(formData.get("seoDescription") ?? "").trim() || null,
      parentId: await resolveParent(formData),
    },
  });

  revalidatePath("/admin/categories");
  revalidatePath("/", "layout");
  redirect("/admin/categories");
}

export async function deleteCategory(formData: FormData): Promise<void> {
  await requireCapability("catalog");
  const id = String(formData.get("id") ?? "");
  // Products keep existing; their categoryId is set to null by the schema rule.
  if (id) await prisma.category.delete({ where: { id } });
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

/** Edit an existing category, including the tile image the homepage uses. */
export async function updateCategory(formData: FormData): Promise<void> {
  await requireCapability("catalog");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/admin/categories");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(`/admin/categories?edit=${id}&error=name`);

  const existing = await prisma.category.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!existing) redirect("/admin/categories");

  // Only re-slug when the field was actually changed, so existing links and
  // any saved menu items pointing at the old slug keep working.
  let slug = existing.slug;
  const wanted = slugify(String(formData.get("slug") ?? "").trim());
  if (wanted && wanted !== existing.slug) {
    slug = wanted;
    let n = 1;
    while (
      await prisma.category.findFirst({
        where: { slug, NOT: { id } },
        select: { id: true },
      })
    ) {
      n += 1;
      slug = `${wanted}-${n}`;
    }
  }

  await prisma.category.update({
    where: { id },
    data: {
      name,
      slug,
      description: String(formData.get("description") ?? "") || null,
      imageUrl: String(formData.get("imageUrl") ?? "") || null,
      subtitle: String(formData.get("subtitle") ?? "").trim() || null,
      bgColour: categoryColour(formData),
      seoTitle: String(formData.get("seoTitle") ?? "").trim() || null,
      seoDescription: String(formData.get("seoDescription") ?? "").trim() || null,
      // `id` is passed so the cycle guard can reject a move under own child.
      parentId: await resolveParent(formData, id),
    },
  });

  revalidatePath("/admin/categories");
  revalidatePath("/", "layout");
  redirect("/admin/categories?saved=1");
}

function bulkIds(formData: FormData): string[] {
  return formData.getAll("ids").map((v) => String(v).trim()).filter(Boolean);
}

/**
 * Bulk delete categories. Products are not deleted with them - the schema
 * nulls `categoryId` and drops the join rows, so the catalogue survives and
 * the products simply become uncategorised.
 */
export async function bulkDeleteCategories(formData: FormData): Promise<void> {
  await requireCapability("catalog");
  const ids = bulkIds(formData);
  if (ids.length) await prisma.category.deleteMany({ where: { id: { in: ids } } });

  revalidatePath("/admin/categories");
  revalidatePath("/", "layout");
  redirect(`/admin/categories?bulk=deleted&n=${ids.length}`);
}

/**
 * Save the order dragged on the Categories list.
 *
 * The list posts every category id in its new order; positions are written
 * 1, 2, 3... in that order. A category the list did not know about - added in
 * another tab while this one was open - keeps its place after the others, so
 * nothing drops out of the order.
 *
 * One UPDATE with a VALUES list rather than one per category: a single round
 * trip, and `updatedAt` is left alone - moving a category is not editing it.
 */
export async function saveCategoryOrder(formData: FormData): Promise<void> {
  await requireCapability("catalog");

  let submitted: unknown;
  try {
    submitted = JSON.parse(String(formData.get("order") ?? "[]"));
  } catch {
    redirect("/admin/categories?error=order");
  }
  if (!Array.isArray(submitted)) redirect("/admin/categories?error=order");

  const wanted = [
    ...new Set((submitted as unknown[]).filter((v): v is string => typeof v === "string")),
  ];
  const known = new Set(
    (await prisma.category.findMany({ where: { id: { in: wanted } }, select: { id: true } })).map(
      (c) => c.id,
    ),
  );
  const ordered = wanted.filter((id) => known.has(id));
  const rest = await prisma.category.findMany({
    where: { id: { notIn: ordered } },
    orderBy: CATEGORY_ORDER,
    select: { id: true },
  });
  const all = [...ordered, ...rest.map((c) => c.id)];

  if (all.length > 0) {
    const values = Prisma.join(all.map((id, i) => Prisma.sql`(${id}, ${i + 1})`));
    await prisma.$executeRaw`
      UPDATE "Category" AS c
      SET "sortOrder" = v.pos::int
      FROM (VALUES ${values}) AS v(id, pos)
      WHERE c.id = v.id::text`;
  }

  // The header, the Shop menu, the home page, the shop sidebar and the footer.
  revalidatePath("/", "layout");
  revalidatePath("/admin/categories");
  redirect("/admin/categories?saved=1");
}
