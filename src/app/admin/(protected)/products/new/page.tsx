import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { ProductForm } from "@/components/ProductForm";
import { createProduct } from "../actions";
import { requireCapability } from "@/lib/permissions";
import { SectionCard, Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { btnPrimary } from "@/components/admin/ui";
import { ProductTypeProvider } from "@/components/admin/ProductTypeFields";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { ProductPicker } from "@/components/admin/ProductPicker";

export const metadata: Metadata = { title: "New product" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "A product name is required.",
  price: "Enter a valid price, for example 24.99",
};

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCapability("catalog");
  const [{ error }, categories, otherProducts, settings, shippingClasses, attributes] =
    await Promise.all([
    searchParams,
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
      take: 500,
    }),
    getSettings(),
    prisma.shippingClass.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.attribute.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        display: true,
        values: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, value: true, colour: true, imageUrl: true, icon: true },
        },
      },
    }),
  ]);
  const storeName = settings[SETTING_KEYS.storeName] || "Br3thr";

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/admin/products"
          aria-label="Back to products"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Create product
        </h1>
      </div>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {ERRORS[error] ?? "Something went wrong."}
        </p>
      ) : null}

      <ProductTypeProvider initial="SIMPLE">
      <ProductForm
        action={createProduct}
        categories={categories}
        isNew
        storeName={storeName}
        hideOrganisation
        attributes={attributes}
        shippingClasses={shippingClasses}
        sidebar={
          <>
            <SectionCard title="Publish">
              <div className="space-y-5">
                <SubmitButton className={`${btnPrimary} w-full justify-center`} pendingLabel="Creating…">
                  Create product
                </SubmitButton>

                <Field label="Status" htmlFor="status">
                  <select id="status" name="status" defaultValue="PUBLISHED" className={fieldSelect}>
                    <option value="DRAFT">Draft &mdash; not visible</option>
                    <option value="PUBLISHED">Published &mdash; live</option>
                    <option value="ARCHIVED">Archived &mdash; hidden</option>
                  </select>
                </Field>

                <label className="flex items-center gap-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="featured"
                    className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
                  />
                  Feature on the homepage
                </label>


                <Link
                  href="/admin/products"
                  className="block rounded-full border border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </Link>
              </div>
            </SectionCard>

            <SectionCard title="Cover image">
              <MediaPicker
                name="coverImageUrl"
                label="Cover image"
                hint="The main image on listing cards and at the top of the product page."
              />
            </SectionCard>

            <SectionCard title="Categories">
              {categories.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No categories yet &mdash; add some under Categories first.
                </p>
              ) : (
                <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto rounded-2xl border border-slate-200 p-3">
                  {categories.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        name="categoryIds"
                        value={c.id}
                        className="h-4 w-4 accent-[var(--admin-accent)]"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">
                The first one ticked is the primary category.
              </p>
            </SectionCard>

            <SectionCard title="After you create it">
              <p className="text-xs leading-relaxed text-slate-500">
                The image gallery, video, extra options and the barcode appear
                once the product exists &mdash; they are rows attached to it.
                Everything on this page saves in one go.
              </p>
            </SectionCard>
          </>
        }
      >
        <SectionCard title="Discount">
          <label className="mb-6 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
            <input
              type="checkbox"
              name="discountActive"
              className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
            />
            <span className="text-sm text-slate-700">
              Run a discount on this product
              <span className="mt-0.5 block text-xs text-slate-500">
                Leave the dates blank to start it immediately and run it until
                you turn it off.
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Discount label" htmlFor="discountTitle">
              <input
                id="discountTitle"
                name="discountTitle"
                placeholder="Summer sale"
                className={fieldInput}
              />
            </Field>
            <Field label="Percent off" htmlFor="discountPercent">
              <input
                id="discountPercent"
                name="discountPercent"
                type="number"
                min="0"
                max="95"
                defaultValue={0}
                className={fieldInput}
              />
            </Field>
            <Field label="Starts" htmlFor="discountStartsAt">
              <input
                id="discountStartsAt"
                name="discountStartsAt"
                type="datetime-local"
                className={fieldInput}
              />
            </Field>
            <Field label="Ends" htmlFor="discountEndsAt">
              <input
                id="discountEndsAt"
                name="discountEndsAt"
                type="datetime-local"
                className={fieldInput}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Checkout Upsell Product">
          <p className="mb-5 text-xs text-slate-500">
            Offered at checkout to anyone with this product in their basket.
            The discount comes off each companion bought in the same order,
            never off this product.
          </p>
          <ProductPicker name="bundleIds" options={otherProducts.map((p) => ({ id: p.id, name: p.name, note: p.status === "PUBLISHED" ? null : "Draft" }))} />
          <div className="mt-6 max-w-xs">
            <Field label="Upsell discount %" htmlFor="bundleDiscountPercent">
              <input
                id="bundleDiscountPercent"
                name="bundleDiscountPercent"
                type="number"
                min="0"
                max="90"
                defaultValue={0}
                className={fieldInput}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Shoppers count">
          <p className="mb-5 text-xs text-slate-500">
            Shown on the slide cart as &ldquo;N+ shoppers have bought this&rdquo;.
            Enter this product&rsquo;s real sales from before this store; every
            paid order is added on top automatically. Leave at 0 to show nothing
            until it sells.
          </p>
          <div className="max-w-xs">
            <Field label="Sales before this store" htmlFor="shoppersBase">
              <input
                id="shoppersBase"
                name="shoppersBase"
                type="number"
                min="0"
                max="10000000"
                step="1"
                defaultValue={0}
                className={fieldInput}
              />
            </Field>
          </div>
        </SectionCard>

      </ProductForm>
      </ProductTypeProvider>
    </div>
  );
}
