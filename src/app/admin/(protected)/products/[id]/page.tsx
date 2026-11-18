import { SITE_HOST } from "@/lib/site";
import Link from "next/link";
import { describeTiers, sanitizeTiers } from "@/lib/quantity-tiers";
import { paidOrderCount } from "@/lib/shopper-count";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { centsToInput } from "@/lib/money";
import { ProductForm } from "@/components/ProductForm";
import { ProductPicker } from "@/components/admin/ProductPicker";
import { FormSubmitButton } from "@/components/admin/FormSubmitButton";
import { SectionCard, Field, fieldInput, fieldSelect, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { IconImage, IconTrash } from "@/components/admin/Icons";
import {
  deleteImage,
  deleteProduct,
  deleteVariant,
  generateVariations,
  saveVariantsBulk,
  saveProductAttributes,
  saveVariant,
  updateProduct,
} from "../actions";
import {
  clearCoverPhoto,
  clearVideo,
  uploadVariantImage,
} from "../upload-actions";
import { Dropzone } from "@/components/admin/Dropzone";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { requireCapability } from "@/lib/permissions";
import { SeoFields } from "@/components/admin/SeoFields";
import { getTimeZone, ymd } from "@/lib/timezone";
import { getBarcodeConfig, renderBarcodeSvg, type BarcodeFormat } from "@/lib/barcode";
import { STOCK_STATUS_OPTIONS } from "@/lib/stock";
import {
  ProductTypeProvider,
  ProductTypeFields,
  TypeOnly,
} from "@/components/admin/ProductTypeFields";
import { ProductDataPanel } from "@/components/admin/ProductDataPanel";
import { ProductAttributesField } from "@/components/admin/ProductAttributesField";
import { SimpleInventoryFields } from "@/components/admin/SimpleInventoryFields";
import { VariantList } from "@/components/admin/VariantList";
import { setVariantBarcode } from "../../settings/barcodes/actions";

export const metadata: Metadata = { title: "Edit product" };
export const dynamic = "force-dynamic";

/** One form for every product field; the sidebar's Save joins it by id. */
const FORM_ID = "product-fields";

const smallInput =
  "w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-[var(--admin-accent)]";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    error?: string;
    uploaded?: string;
    rejected?: string;
  }>;
}) {
  const tz = await getTimeZone();
  await requireCapability("catalog");
  const [{ id }, { saved, uploaded, rejected, error }] = await Promise.all([
    params,
    searchParams,
  ]);

  const settings = await getSettings();
  const seoStoreName = settings[SETTING_KEYS.storeName] || "Br3thr";

  const [product, categories, attributes, otherProducts, barcodeConfig, shippingClasses] =
    await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          orderBy: { sortOrder: "asc" },
          include: {
            values: { include: { attributeValue: { include: { attribute: true } } } },
          },
        },
        images: { orderBy: { sortOrder: "asc" } },
        attributeValues: { select: { attributeValueId: true } },
        bundledWith: { select: { id: true } },
        categories: { select: { id: true } },
      },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.attribute.findMany({
      orderBy: { sortOrder: "asc" },
      include: { values: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.product.findMany({
      where: { status: { not: "ARCHIVED" }, id: { not: id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
      take: 300,
    }),
    getBarcodeConfig(),
      prisma.shippingClass.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
    ]);

  if (!product) notFound();
  const paidOrders = await paidOrderCount(product.id);
  const tiers = sanitizeTiers(product.quantityTiers);

  /*
   * The default variant carries the product's barcode - the sidebar shows and
   * edits that one, the way the rest of the shop treats it as the product's
   * own code.
   */
  const mainVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  // The pricing form spans the General and Inventory tabs, so its fields join it by id.
  const VARIANTS_FORM_ID = "product-variants-form";
  const chosenAttributeValueIds = new Set(
    product.attributeValues.map((a) => a.attributeValueId),
  );
  const mainBarcodeSvg =
    barcodeConfig.enabled && mainVariant?.barcode
      ? renderBarcodeSvg(
          mainVariant.barcode,
          (mainVariant.barcodeFormat as BarcodeFormat) ?? barcodeConfig.format,
          { height: 12, scale: 2 },
        )
      : null;

  return (
    /*
     * space-y-5 on the root: the cards are siblings here (Media and Variants
     * can't live inside the product form), so without it
     * they sat flush against each other.
     */
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
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
          Edit product
        </h1>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/admin/products/new"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
          >
            New product
          </Link>
          {saved ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              Saved
            </span>
          ) : null}
          <span
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              product.status === "PUBLISHED"
                ? "border border-[var(--admin-accent)] text-[var(--admin-accent)]"
                : "border border-slate-200 text-slate-500"
            }`}
          >
            {product.status === "PUBLISHED" ? "Published" : "Draft"}
          </span>
        </div>
      </div>

      {/* Editor on the left, the WordPress-style meta boxes on the right. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-5">
        <ProductTypeProvider initial={product.type}>
      <ProductForm
        storeName={seoStoreName}
        action={updateProduct}
        product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          status: product.status,
          categoryId: product.categoryId,
          categoryIds: product.categories.map((c) => c.id),
          shortDescription: product.shortDescription,
          description: product.description,
          shortFormat: product.shortFormat,
          shortTable: product.shortTable,
          descriptionFormat: product.descriptionFormat,
          descriptionTable: product.descriptionTable,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          featured: product.featured,
          type: product.type,
          externalUrl: product.externalUrl,
          externalLabel: product.externalLabel,
        }}
        categories={categories}
        isNew={false}
        formId={FORM_ID}
        showButtons={false}
        hideOrganisation
        hideProductData
      />

      {/* ---------- Product data, in tabs like WooCommerce ---------- */}
      <SectionCard title="Product data">
        <ProductDataPanel
          general={
            <div className="space-y-7">
              <ProductTypeFields
                defaultType={product.type}
                defaultUrl={product.externalUrl ?? ""}
                defaultLabel={product.externalLabel ?? ""}
                formId={FORM_ID}
              />

              <TypeOnly types={["SIMPLE", "EXTERNAL", "GROUPED"]}>
                <div className="border-t border-slate-100 pt-7">
          {/*
           * Price belongs to the one form the whole screen saves with.
           *
           * It used to sit in a form of its own with a "Save price" button,
           * which only existed on this tab: from Inventory or Shipping there
           * was no way to save it, and "Save changes" - the button that is
           * always there - quietly left it behind. One button now saves the
           * product, its price and its stock together.
           */}
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2">
              <Field label="Regular price" htmlFor="regularPrice">
                <input
                  id="regularPrice"
                  name="regularPrice"
                  form={FORM_ID}
                  defaultValue={centsToInput(
                    mainVariant?.compareAtCents ?? mainVariant?.priceCents ?? 0,
                  )}
                  placeholder="0.00"
                  className={fieldInput}
                />
              </Field>
              <Field label="Sale price (optional)" htmlFor="salePrice">
                <input
                  id="salePrice"
                  name="salePrice"
                  form={FORM_ID}
                  defaultValue={
                    mainVariant?.compareAtCents ? centsToInput(mainVariant.priceCents) : ""
                  }
                  placeholder="0.00"
                  className={fieldInput}
                />
              </Field>
            </div>
            {/*
             * Stock and SKU used to sit here as well as on the Inventory tab.
             * Both tabs are this one form, so the page carried two inputs named
             * "stock" and two named "sku": whichever came first won, and the
             * value typed on the other tab was thrown away. Worse, the copy
             * here was always present, so "track this option's quantity" could
             * never be read as off. They live on the Inventory tab now, which
             * is where someone goes looking for them.
             */}

            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
              Fill the sale price and the shop charges it, showing the regular
              price struck through beside it. Leave it blank to sell at the
              regular price. Switch the type to <strong>Variable</strong> above
              to sell sizes or colours with their own prices. Saved with{" "}
              <strong>Save changes</strong>, like everything else on this form.
            </p>

          </div>
                </div>
              </TypeOnly>

              <TypeOnly types={["VARIABLE", "GIFT_CARD"]}>
                <p className="rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-600">
                  A variable product is priced on each of its variations. Tick the
                  attribute values it comes in under <strong>Attributes</strong>,
                  then build the options under <strong>Variations</strong>.
                </p>
              </TypeOnly>
            </div>
          }
          inventory={
            /*
             * One set of stock fields, on the option that is actually sold.
             *
             * This tab used to carry two: a product-level SKU, stock status,
             * "manage stock at product level" and quantity, and then the very
             * same four on the option below. The product-level four were
             * written to the database and read by nothing - not the shop, not
             * the cart, not canSell() - so setting a product "Out of stock"
             * there saved happily and the shop went on selling it. They are
             * gone. What is left is the option's own stock, which is what
             * every part of the storefront actually reads.
             */
            <div className="space-y-7">
              {/* The one setting that belongs to the product rather than to
                  an option, so it stays on the main form. */}
              <label className="flex max-w-xl items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                <input
                  type="checkbox"
                  name="soldIndividually"
                  form={FORM_ID}
                  defaultChecked={product.soldIndividually}
                  className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
                />
                <span className="text-sm text-slate-700">
                  Sold individually
                  <span className="mt-0.5 block text-xs text-slate-500">
                    One per order, whatever the quantity box says.
                  </span>
                </span>
              </label>

              <TypeOnly types={["SIMPLE"]}>
                <div className="space-y-5 border-t border-slate-100 pt-7">
                  <p className="text-sm font-medium text-slate-700">Stock</p>
                  <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2">
                    <Field label="SKU" htmlFor="invSku">
                      <input
                        id="invSku"
                        name="sku"
                        form={FORM_ID}
                        defaultValue={mainVariant?.sku ?? ""}
                        className={fieldInput}
                      />
                    </Field>
                    <Field label="Stock status" htmlFor="invStockStatus">
                      <select
                        id="invStockStatus"
                        name="stockStatus"
                        form={FORM_ID}
                        defaultValue={mainVariant?.stockStatus ?? "IN_STOCK"}
                        className={fieldSelect}
                      >
                        {STOCK_STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    {/* Quantity, backorders and the threshold only when counted. */}
                    <SimpleInventoryFields
                      formId={FORM_ID}
                      manageStock={mainVariant?.manageStock ?? false}
                      stock={mainVariant?.stock ?? 0}
                      backorders={mainVariant?.backorders ?? "NO"}
                      lowStockAmount={mainVariant?.lowStockAmount ?? null}
                    />
                  </div>
                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    Saved with <strong>Save changes</strong>, like the rest of
                    this form. Price has its own button on the General tab.
                  </p>
                </div>
              </TypeOnly>

              {/* Sold elsewhere: there is no stock here to count, only a code
                  to file it under. */}
              <TypeOnly types={["EXTERNAL"]}>
                <div className="space-y-5 border-t border-slate-100 pt-7">
                  <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2">
                    <Field label="SKU" htmlFor="invSkuExternal">
                      <input
                        id="invSkuExternal"
                        name="sku"
                        form={FORM_ID}
                        defaultValue={mainVariant?.sku ?? ""}
                        className={fieldInput}
                      />
                    </Field>
                  </div>
                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    This product is bought on another site, so there is no
                    stock to keep here. The SKU saves with{" "}
                    <strong>Save changes</strong>.
                  </p>
                </div>
              </TypeOnly>

              {/* A set is only as available as the things in it, each of which
                  keeps its own stock on its own page. */}
              <TypeOnly types={["GROUPED"]}>
                <div className="space-y-5 border-t border-slate-100 pt-7">
                  <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2">
                    <Field label="SKU" htmlFor="invSkuGrouped">
                      <input
                        id="invSkuGrouped"
                        name="sku"
                        form={FORM_ID}
                        defaultValue={mainVariant?.sku ?? ""}
                        className={fieldInput}
                      />
                    </Field>
                  </div>
                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    The products in this set each carry their own stock, on
                    their own pages. The SKU saves with{" "}
                    <strong>Save changes</strong>.
                  </p>
                </div>
              </TypeOnly>

              <TypeOnly types={["VARIABLE", "GIFT_CARD"]}>
                <p className="rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-600">
                  Each option carries its own SKU, quantity, status, backorders
                  and low-stock threshold &mdash; they are in the{" "}
                  <strong>Variations</strong> tab, saved by &ldquo;Save all
                  options&rdquo;.
                </p>
              </TypeOnly>
            </div>
          }

          shipping={
            <div className="space-y-5">
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                A shipping class groups things that cost the same to post. What
                each class adds to a shipping method is set under{" "}
                <Link href="/admin/settings/shipping" className="font-medium text-[var(--admin-accent)] hover:underline">
                  Shop Settings &rsaquo; Shipping
                </Link>
                .
              </p>
              <Field label="Shipping class" htmlFor="shippingClassId">
                <select
                  id="shippingClassId"
                  name="shippingClassId"
                  form={FORM_ID}
                  defaultValue={product.shippingClassId ?? ""}
                  className={fieldSelect}
                >
                  <option value="">No shipping class</option>
                  {shippingClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <p className="text-xs text-slate-500">
                Saved with <strong>Save changes</strong>.
              </p>
            </div>
          }
          attributes={
            /*
             * The same picker the create page uses, so attributes and their
             * values can be added from a saved product too - this tab used to
             * be a plain list of tickboxes with nowhere to add anything.
             */
            <form id="attributes" action={saveProductAttributes} className="space-y-5 scroll-mt-24">
              <input type="hidden" name="productId" value={product.id} />
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                Tick everything this product comes in. They show on the product
                page as its specification, and a variable product builds its
                options from exactly these.
              </p>
              <ProductAttributesField
                section="picker"
                attributes={attributes}
                checkedIds={[...chosenAttributeValueIds]}
              />
              <div className="flex justify-end">
                <SubmitButton className={btnPrimary} pendingLabel="Saving…">
                  Save attributes
                </SubmitButton>
              </div>
            </form>
          }
          variations={
            <div className="space-y-5">
              <form
                action={generateVariations}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3.5"
              >
                <input type="hidden" name="productId" value={product.id} />
                <p className="text-xs leading-relaxed text-slate-600">
                  Builds one option for every combination of the ticked
                  attributes. Existing options are left alone, and new ones start
                  at zero stock.
                </p>
                <SubmitButton
                  className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                  pendingLabel="Building…"
                >
                  Generate variations
                </SubmitButton>
              </form>

        <SectionCard
          title="Variants & pricing"
          action={
            <Link
              href="/admin/attributes"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Manage attributes
            </Link>
          }
        >
          {/*
            One form for the whole table, joined by `form=` on each field, so
            every option saves with the single button underneath. The image
            upload and delete stay as their own forms - a form cannot contain
            another, and those are different actions.
          */}
          <form id={VARIANTS_FORM_ID} action={saveVariantsBulk} className="scroll-mt-24">
            <input type="hidden" name="productId" value={product.id} />
          </form>

          {/*
            One line per option, with the rest behind Edit. The image upload and
            delete are still their own forms - a form cannot contain another -
            so they are passed in as slots.
          */}
          <VariantList
            formId={VARIANTS_FORM_ID}
            rows={product.variants.map((v) => ({
              id: v.id,
              name: v.name,
              options: v.values.map((val) => ({
                id: val.id,
                label: `${val.attributeValue.attribute.name}: ${val.attributeValue.value}`,
              })),
              sku: v.sku,
              priceCents: v.priceCents,
              compareAtCents: v.compareAtCents,
              stockStatus: v.stockStatus ?? "IN_STOCK",
              manageStock: v.manageStock,
              stock: v.stock,
              backorders: v.backorders,
              lowStockAmount: v.lowStockAmount,
              isActive: v.isActive,
              image: (
                <form action={uploadVariantImage} className="flex items-center gap-2">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="variantId" value={v.id} />
                  {v.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={v.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                      <IconImage />
                    </span>
                  )}
                  <input
                    type="file"
                    name="file"
                    accept="image/*"
                    aria-label={`Image for ${v.name}`}
                    className="w-40 text-[11px] file:mr-1 file:rounded-full file:border file:border-slate-200 file:bg-white file:px-2 file:py-1 file:text-[11px] file:text-slate-600"
                  />
                  <SubmitButton
                    pendingLabel=""
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Upload
                  </SubmitButton>
                </form>
              ),
              remove: (
                <form action={deleteVariant}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="variantId" value={v.id} />
                  <SubmitButton
                    pendingLabel="…"
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <IconTrash className="h-4 w-4" />
                  </SubmitButton>
                </form>
              ),
            }))}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Edit any of the rows above, then save them all at once.
            </p>
            <FormSubmitButton
              formId={VARIANTS_FORM_ID}
              action={saveVariantsBulk}
              className={btnPrimary}
            >
              Save all options
            </FormSubmitButton>
          </div>

          <form action={saveVariant} className="mt-5 rounded-2xl bg-slate-50 p-5">
            <input type="hidden" name="productId" value={product.id} />
            <p className="mb-4 text-sm font-medium text-slate-700">Add a variant</p>

            {attributes.length > 0 ? (
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {attributes.map((attr) => (
                  <label key={attr.id} className="block">
                    <span className="mb-1 block text-xs text-slate-500">{attr.name}</span>
                    <select
                      name={`attrValue_${attr.id}`}
                      defaultValue=""
                      className="w-full appearance-none rounded-full border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-[var(--admin-accent)]"
                    >
                      <option value="">Any</option>
                      {attr.values.map((val) => (
                        <option key={val.id} value={val.id}>
                          {val.value}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : (
              <p className="mb-4 text-sm text-slate-500">
                No attributes defined yet.{" "}
                <Link href="/admin/attributes" className="font-medium text-[var(--admin-accent)] hover:underline">
                  Create Size or Colour
                </Link>{" "}
                to build proper variations, or just add a priced option below.
              </p>
            )}

            {/*
              Labelled like the attribute pickers above. Placeholders alone were
              cut off ("Label (auto from opti") and the stock box read as a bare
              "0" with nothing saying what it was.
            */}
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="block min-w-0">
                <span className="mb-1 block text-xs text-slate-500">Label</span>
                <input name="name" placeholder="Auto from options" className={smallInput} />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs text-slate-500">Price</span>
                <input name="priceCents" inputMode="decimal" required placeholder="0.00" className={smallInput} />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs text-slate-500">Compare at</span>
                <input name="compareAtCents" inputMode="decimal" placeholder="Optional" className={smallInput} />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs text-slate-500">Stock</span>
                <input name="stock" type="number" min="0" defaultValue="0" className={smallInput} />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs text-slate-500">Image URL</span>
                <input name="imageUrl" placeholder="Optional" className={smallInput} />
              </label>
            </div>
            <div className="mt-4 flex justify-end" data-add-variant-labelled>
              <SubmitButton
                pendingLabel="Adding…"
                className="rounded-full border border-[var(--admin-accent)] px-5 py-2 text-sm font-medium text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
              >
                Add variant
              </SubmitButton>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              &ldquo;Compare at&rdquo; is the higher regular price shown struck
              through next to the selling price. Leave it blank when the item
              isn&rsquo;t on sale.
            </p>
          </form>
        </SectionCard>
            </div>
          }
        />
      </SectionCard>



      {/* ---------- Price, or variants, depending on the type ---------- */}

      <div className="space-y-5">

        <SectionCard title="Checkout Upsell Product">
          <p className="mb-5 text-xs text-slate-500">
            Offered at checkout to anyone with this product in their basket,
            each companion with its own Add button. (For a grouped product,
            these are also the set&rsquo;s contents shown on its page.) Two or
            three companions works best.
          </p>
          <ProductPicker
            name="bundleIds"
            options={otherProducts.map((p) => ({ id: p.id, name: p.name, note: p.status === "PUBLISHED" ? null : "Draft" }))}
            formId={FORM_ID}
            defaultValue={product.bundledWith.map((b) => b.id)}
          />
          <div className="mt-6 max-w-xs">
            <Field label="Upsell discount %" htmlFor="bundleDiscountPercent">
              <input
                id="bundleDiscountPercent"
                name="bundleDiscountPercent"
                type="number"
                min="0"
                max="90"
                form={FORM_ID}
                defaultValue={product.bundleDiscountPercent}
                className={fieldInput}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Taken off each companion bought in the same order as this product
            &mdash; one companion per unit of this product &mdash; never off this
            product itself. Leave at 0 for no discount.
          </p>
        </SectionCard>

        <SectionCard title="Shoppers count">
          <p className="mb-5 text-xs text-slate-500">
            Shown on the slide cart as &ldquo;N+ shoppers have bought this&rdquo;.
            Enter this product&rsquo;s real sales from before this store (for
            example your Shopify history); every paid order here is added on top
            automatically. At 0 with no paid orders, nothing is shown.
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
                form={FORM_ID}
                defaultValue={product.shoppersBase}
                className={fieldInput}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Paid orders so far: {paidOrders}. The cart shows{" "}
            {(product.shoppersBase + paidOrders).toLocaleString("en-CA")}+ now.
          </p>
        </SectionCard>

        <SectionCard title="Bundle &amp; Save">
          {/* Rules are set for many products at once on their own page. */}
          <p className="text-sm text-slate-700">
            {tiers.some((t) => t.percent > 0) ? describeTiers(tiers) : "No bundle rule on this product."}
          </p>
          <Link
            href={
              tiers.some((t) => t.percent > 0)
                ? `/admin/products/bundle-save?edit=${encodeURIComponent(product.id)}`
                : `/admin/products/bundle-save?ids=${encodeURIComponent(product.id)}`
            }
            className="mt-3 inline-block text-sm font-medium text-[var(--admin-accent)] hover:underline"
          >
            Manage on the Bundle &amp; Save page &rarr;
          </Link>
        </SectionCard>

        {/* ---------- Discount ---------- */}
        <SectionCard title="Discount">
          <div className="space-y-6">
            {/*
              These used to repeat every core field as a hidden copy "so
              updateProduct gets them too" - but they are in the SAME form the
              main fields are in, so each name appeared twice. Two inputs with
              one name is always a hazard: the browser sends both, the server
              reads whichever comes first, and the stale copy silently reverts
              what was just typed. `featured` was the clearest case - the
              hidden "on" meant a product could never be un-featured.
              ProductForm renders all of them already.
            */}

            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="discountActive"
                defaultChecked={product.discountActive}
                className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
               form={FORM_ID}/>
              Run a scheduled discount on this product
            </label>

            <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Discount title" htmlFor="discountTitle">
                <input
                  id="discountTitle"
                  name="discountTitle"
                  defaultValue={product.discountTitle ?? ""}
                  placeholder="Spring sale"
                  className={fieldInput}
                 form={FORM_ID}/>
              </Field>
              <Field label="Percent off" htmlFor="discountPercent">
                <input
                  id="discountPercent"
                  name="discountPercent"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={product.discountPercent}
                  className={fieldInput}
                 form={FORM_ID}/>
              </Field>
              <Field label="Starts" htmlFor="discountStartsAt">
                <input
                  id="discountStartsAt"
                  name="discountStartsAt"
                  type="date"
                  defaultValue={
                    product.discountStartsAt
                      ? ymd(product.discountStartsAt, tz)
                      : ""
                  }
                  className={fieldInput}
                 form={FORM_ID}/>
              </Field>
              <Field label="Ends" htmlFor="discountEndsAt">
                <input
                  id="discountEndsAt"
                  name="discountEndsAt"
                  type="date"
                  defaultValue={
                    product.discountEndsAt
                      ? ymd(product.discountEndsAt, tz)
                      : ""
                  }
                  className={fieldInput}
                 form={FORM_ID}/>
              </Field>
            </div>

            <p className="text-xs text-slate-400">
              Applies on top of each variant&rsquo;s price while the window is
              open. For a permanent markdown, set a &ldquo;Compare at&rdquo; price
              on the variants instead.
            </p>

          </div>
        </SectionCard>

        <SectionCard title="Search engine listing">
          <SeoFields
            formId={FORM_ID}
            defaultTitle={product.seoTitle ?? ""}
            defaultDescription={product.seoDescription ?? ""}
            context={{
              title: product.name,
              sitename: seoStoreName,
              sep: "|",
              category:
                categories.find((c) => c.id === product.categoryId)?.name ?? "",
            }}
            subject={`Product: ${product.name}. ${product.shortDescription ?? ""}`}
            urlPrefix={`${SITE_HOST}/products/`}
          />
        </SectionCard>


      </div>
        </ProductTypeProvider>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-4">
          <SectionCard title="Publish">
            <div className="space-y-5">
              <FormSubmitButton
                formId={FORM_ID}
                action={updateProduct}
                className={`${btnPrimary} w-full justify-center`}
              >
                Save changes
              </FormSubmitButton>

              <Field label="Status" htmlFor="status">
                <select
                  id="status"
                  name="status"
                  form={FORM_ID}
                  defaultValue={product.status}
                  className={fieldSelect}
                >
                  <option value="DRAFT">Draft &mdash; not visible</option>
                  <option value="PUBLISHED">Published &mdash; live</option>
                  <option value="ARCHIVED">Archived &mdash; hidden</option>
                </select>
              </Field>

              <label className="flex items-center gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="featured"
                  form={FORM_ID}
                  defaultChecked={product.featured}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
                />
                Feature on the homepage
              </label>

              {/* Set from Free Gift offers only, so it is shown, not edited, here. */}
              {product.isGiftOnly ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
                  🎁 <strong>Free gift product.</strong> It is the gift in a Free Gift
                  offer, so it is hidden from the shop, search and every listing and
                  can&rsquo;t be bought. Change it under Promotions &rarr; Free Gifts.
                </p>
              ) : null}

              <dl className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <div className="flex justify-between gap-3">
                  <dt>Created</dt>
                  <dd className="text-slate-700">{ymd(product.createdAt, tz)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Last saved</dt>
                  <dd className="text-slate-700">{ymd(product.updatedAt, tz)}</dd>
                </div>
              </dl>

              <Link
                href={`/products/${product.slug}`}
                target="_blank"
                rel="noreferrer"
                className="block rounded-full border border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
              >
                {product.status === "PUBLISHED" ? "View on site" : "Preview"}
              </Link>
            </div>
          </SectionCard>

                  <SectionCard title="Media">
            {uploaded ? (
              <p className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Uploaded {uploaded} file{uploaded === "1" ? "" : "s"}.
              </p>
            ) : null}
            {rejected ? (
              <p className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {rejected} file{rejected === "1" ? " was" : "s were"} rejected &mdash;
                check the file type and size limits below.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error === "skutaken"
                  ? "That SKU is already used by another variant. Codes have to be unique across the shop, so a scan only ever resolves to one item."
                  : error === "variant"
                    ? "That variant couldn't be saved — check the price."
                    : "Something went wrong."}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-3">
              <Dropzone
                  productId={product.id}
                  kind="cover"
                  label="Upload Cover photo"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  hint={"Allowed *.jpeg, *.jpg, *.png, *.gif\nMax size of 3.1 MB"}
                />

              <Dropzone
                  productId={product.id}
                  kind="photos"
                  label="Upload Product photo"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  hint={"Allowed *.jpeg, *.jpg, *.png, *.gif\nMax size of 3.1 MB"}
                  multiple
                />

              <Dropzone
                  productId={product.id}
                  kind="video"
                  label="Upload Video"
                  accept="video/mp4,video/quicktime,video/x-msvideo,video/x-ms-wmv"
                  hint={"Allowed *.MP4, .MOV, .AVI, .WMV\nMax size of 5.1 MB"}
                  tone="video"
                />
            </div>

            {(product.coverImageUrl || product.images.length > 0 || product.videoUrl) ? (
              <div className="mt-6 flex flex-wrap items-start gap-3">
                {product.coverImageUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.coverImageUrl}
                      alt="Cover"
                      className="h-24 w-24 rounded-xl border-2 border-[var(--admin-accent)] object-cover"
                    />
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--admin-btn)] px-2 py-0.5 text-[10px] font-medium text-[var(--admin-btn-ink)]">
                      Cover
                    </span>
                    <form action={clearCoverPhoto} className="absolute -right-2 -top-2">
                      <input type="hidden" name="productId" value={product.id} />
                      <button
                        type="submit"
                        aria-label="Remove cover photo"
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition hover:text-red-600"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </div>
                ) : null}

                {product.images.map((img) => (
                  <div key={img.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.alt ?? ""}
                      className="h-24 w-24 rounded-xl border border-slate-200 object-cover"
                    />
                    <form action={deleteImage} className="absolute -right-2 -top-2">
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <button
                        type="submit"
                        aria-label="Remove image"
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition hover:text-red-600"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </div>
                ))}

                {product.videoUrl ? (
                  <div className="relative">
                    <video
                      src={product.videoUrl}
                      controls
                      className="h-24 w-40 rounded-xl border border-slate-200 bg-black object-cover"
                    />
                    <form action={clearVideo} className="absolute -right-2 -top-2">
                      <input type="hidden" name="productId" value={product.id} />
                      <button
                        type="submit"
                        aria-label="Remove video"
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition hover:text-red-600"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-5 text-sm text-slate-400">No media uploaded yet.</p>
            )}
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
                      form={FORM_ID}
                      defaultChecked={
                        product.categories.some((pc) => pc.id === c.id) ||
                        product.categoryId === c.id
                      }
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

          {barcodeConfig.enabled && mainVariant ? (
            <SectionCard title="Product barcode">
              {mainBarcodeSvg ? (
                <div
                  className="[&>svg]:mx-auto [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-[240px]"
                  dangerouslySetInnerHTML={{ __html: mainBarcodeSvg }}
                />
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-500">
                  No code yet. Save a number below, or generate one for every
                  product in barcode settings.
                </p>
              )}

              {/* Its own form: the product form cannot nest another. */}
              <form action={setVariantBarcode} className="mt-4 space-y-2">
                <input type="hidden" name="variantId" value={mainVariant.id} />
                <input type="hidden" name="productId" value={product.id} />
                <label htmlFor="barcode" className="block text-xs font-medium text-slate-600">
                  Custom number
                </label>
                <input
                  id="barcode"
                  name="barcode"
                  defaultValue={mainVariant.barcode ?? ""}
                  placeholder="Leave blank to clear"
                  className={fieldInput}
                />
                <SubmitButton
                  className="w-full rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                  pendingLabel="Saving…"
                >
                  Update barcode
                </SubmitButton>
              </form>
              <p className="mt-3 text-xs text-slate-400">
                Applies to the default option. Other options keep their own codes,
                set under Variants.
              </p>
            </SectionCard>
          ) : null}

        <SectionCard title="Danger zone">
          <form action={deleteProduct}>
            <input type="hidden" name="id" value={product.id} />
            <button
              type="submit"
              className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Delete this product
            </button>
          </form>
          <p className="mt-3 text-xs text-slate-400">
            Past orders keep their own copy of the name and price, so deleting a
            product does not alter order history.
          </p>
        </SectionCard>
        </aside>
      </div>
    </div>
  );
}
