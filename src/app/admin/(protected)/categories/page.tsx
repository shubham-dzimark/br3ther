import { SITE_HOST } from "@/lib/site";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { Card, btnPrimary } from "@/components/admin/ui";
import { Field, fieldSelect, fieldInput } from "@/components/admin/Field";
import Link from "next/link";
import { SeoFields } from "@/components/admin/SeoFields";
import { MediaPicker } from "@/components/admin/MediaPicker";
import {
  bulkDeleteCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  saveCategoryOrder,
} from "./actions";
import { requireCapability } from "@/lib/permissions";
import { BulkBar } from "@/components/admin/BulkBar";
import { CategoryTable } from "@/components/admin/CategoryTable";
import { CATEGORY_ORDER } from "@/lib/category-order";
import { mediaSrc } from "@/lib/media-src";

export const metadata: Metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; saved?: string; error?: string }>;
}) {
  await requireCapability("catalog");
  const [{ edit, saved }, categories, settings] = await Promise.all([
    searchParams,
    // The storefront's order, which this list sets by dragging. It was
    // alphabetical here while the storefront used a position nobody could
    // set, so the two never matched.
    prisma.category.findMany({
      orderBy: CATEGORY_ORDER,
      include: { _count: { select: { products: true } } },
    }),
    getSettings(),
  ]);
  const storeName = settings[SETTING_KEYS.storeName] || "Br3thr";

  const editing = edit ? (categories.find((c) => c.id === edit) ?? null) : null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card className="overflow-hidden lg:col-span-2">
        <div className="px-6 pt-6">
          <h1 className="text-xl font-semibold text-slate-900">Categories</h1>
        </div>

        {categories.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">
            No categories yet.
          </p>
        ) : (
          <>
          <form id="bulk-categories" className="mt-5 px-6">
            <BulkBar
              formId="bulk-categories"
              noun="category"
              actions={[{ label: "Delete", action: bulkDeleteCategories, danger: true }]}
            />
          </form>

          <CategoryTable
            /*
             * Keyed to the list itself: the table holds its order in state, so
             * a category added, deleted, re-parented or reordered on the server
             * has to start it afresh or the new list would be ignored.
             */
            key={categories.map((c) => `${c.id}:${c.parentId ?? ""}`).join("|")}
            rows={categories.map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              imageSrc: c.imageUrl ? mediaSrc(c.imageUrl) : null,
              productCount: c._count.products,
              parentId: c.parentId,
            }))}
            editingId={editing?.id ?? null}
            deleteAction={deleteCategory}
            saveOrderAction={saveCategoryOrder}
          />
          </>
        )}
      </Card>

      <Card className="h-fit p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {editing ? `Edit ${editing.name}` : "Add a category"}
          </h2>
          {editing ? (
            <Link href="/admin/categories" className="text-sm text-slate-500 hover:text-slate-900">
              Cancel
            </Link>
          ) : null}
        </div>

        {saved ? (
          <p className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Saved.
          </p>
        ) : null}

        {/* A distinct key rebuilds the inputs when switching between
            categories, instead of keeping the previous one's values. */}
        <form
          id="category-editor"
          key={editing?.id ?? "new"}
          action={editing ? updateCategory : createCategory}
          className="space-y-7"
        >
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

          <Field label="Parent category" htmlFor="cat-parent">
            <select
              id="cat-parent"
              name="parentId"
              defaultValue={editing?.parentId ?? ""}
              className={fieldSelect}
            >
              <option value="">None — top level</option>
              {categories
                /*
                 * Only top-level categories can be parents, and a category can
                 * never be offered itself. The action re-checks this, so a
                 * hand-posted form still can't build a loop.
                 */
                .filter((c) => !c.parentId && c.id !== editing?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Name" htmlFor="cat-name">
            <input
              id="cat-name"
              name="name"
              required
              defaultValue={editing?.name ?? ""}
              className={fieldInput}
            />
          </Field>
          <Field label="Slug" htmlFor="cat-slug">
            <input
              id="cat-slug"
              name="slug"
              placeholder="optional"
              defaultValue={editing?.slug ?? ""}
              className={fieldInput}
            />
          </Field>
          <Field label="Description" htmlFor="cat-desc">
            <input
              id="cat-desc"
              name="description"
              placeholder="optional"
              defaultValue={editing?.description ?? ""}
              className={fieldInput}
            />
          </Field>

          <Field label="Card subtitle (small line above the name)" htmlFor="cat-subtitle">
            <input
              id="cat-subtitle"
              name="subtitle"
              placeholder="e.g. Cuban Cigars"
              defaultValue={editing?.subtitle ?? ""}
              className={fieldInput}
            />
          </Field>

          <Field label="Card background colour" htmlFor="cat-bg">
            <span className="flex items-center gap-3">
              <input
                id="cat-bg"
                name="bgColour"
                type="color"
                defaultValue={editing?.bgColour || "#E8F1FB"}
                className="h-11 w-16 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
              />
              {/* Text beside the swatch so a colour can be cleared or pasted:
                  a bare colour input has no empty state. */}
              <input
                name="bgColourText"
                placeholder="#E8F1FB, or blank for the brand tint"
                defaultValue={editing?.bgColour ?? ""}
                className={fieldInput}
              />
            </span>
          </Field>

          <MediaPicker
            name="imageUrl"
            label="Tile image"
            defaultValue={editing?.imageUrl ?? ""}
            hint="Used on the homepage category tiles. A tall crop works best — around 800 × 1000."
          />

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="mb-4 text-sm font-semibold text-slate-900">
              Search engine listing
            </p>
            <SeoFields
              defaultTitle={editing?.seoTitle ?? ""}
              defaultDescription={editing?.seoDescription ?? ""}
              context={{
                title: editing?.name ?? "",
                sitename: storeName,
                sep: "|",
                excerpt: editing?.description ?? "",
              }}
              subject={`Product category: ${editing?.name ?? "new category"}. ${editing?.description ?? ""}`}
              urlPrefix={`${SITE_HOST}/shop?category=`}
            />
          </div>

          <button type="submit" className={btnPrimary}>
            {editing ? "Save category" : "Add category"}
          </button>
        </form>
      </Card>
    </div>
  );
}
