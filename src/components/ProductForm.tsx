import { SITE_HOST } from "@/lib/site";
import Link from "next/link";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { SeoFields } from "@/components/admin/SeoFields";
import { ProductTypeFields, TypeOnly } from "@/components/admin/ProductTypeFields";
import {
  AttributesProvider,
  ProductAttributesField,
} from "@/components/admin/ProductAttributesField";
import { ProductDataPanel } from "@/components/admin/ProductDataPanel";
import { BACKORDER_OPTIONS, STOCK_STATUS_OPTIONS } from "@/lib/stock";
import { centsToInput } from "@/lib/money";
import {
  Field,
  SectionCard,
  fieldInput,
  fieldSelect,
  fieldTextarea,
} from "@/components/admin/Field";
import { NameSlugFields } from "@/components/admin/NameSlugFields";
import { btnPrimary } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { DescriptionField } from "@/components/admin/DescriptionField";
import { parseSpecTable, specFormat } from "@/lib/spec-table";

type Category = { id: string; name: string };

type ProductFormValues = {
  id?: string;
  name?: string;
  slug?: string;
  status?: string;
  categoryId?: string | null;
  categoryIds?: string[];
  shortDescription?: string | null;
  description?: string | null;
  shortFormat?: string | null;
  shortTable?: string | null;
  descriptionFormat?: string | null;
  descriptionTable?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  featured?: boolean;
  type?: string;
  externalUrl?: string | null;
  externalLabel?: string | null;
};

export function ProductForm({
  action,
  product,
  categories,
  isNew,
  children,
  formId,
  showButtons = true,
  hideOrganisation = false,
  hideProductData = false,
  shippingClasses = [],
  attributes = [],
  sidebar,
  /** Used to expand %%sitename%% in the SEO preview. */
  storeName = "",
}: {
  action: (formData: FormData) => void | Promise<void>;
  product?: ProductFormValues;
  categories: Category[];
  isNew: boolean;
  storeName?: string;
  /**
   * Extra sections (discount, checkout upsell, SEO) rendered inside this same form, so
   * the whole product saves with one button instead of each card having its
   * own - and so a field can't silently sit outside any form.
   */
  children?: React.ReactNode;
  /**
   * When set, the <form> takes this id so fields elsewhere on the page can join
   * it with `form={formId}`. HTML forbids nested forms and the Media and
   * Variants cards contain their own, so this is how they sit between the
   * product's fields while everything still saves with one button.
   */
  formId?: string;
  /** Off when the page renders its own save bars around other sections. */
  showButtons?: boolean;
  /**
   * Leaves out categories, status and "feature on the homepage".
   *
   * The edit page puts those in its sidebar, the way WordPress does, and they
   * join this form with `form={formId}` from there - so they must not also be
   * rendered here, or the product would post two values for each.
   */
  hideOrganisation?: boolean;
  /** The edit page renders its own tabbed Product data panel instead. */
  hideProductData?: boolean;
  /** Shows the attribute picker inside Product data, for any product type. */
  attributes?: {
    id: string;
    name: string;
    display?: string;
    values: {
      id: string;
      value: string;
      colour?: string | null;
      imageUrl?: string | null;
      icon?: string | null;
    }[];
  }[];
  /** Shipping classes to choose from, for the Shipping tab. */
  shippingClasses?: { id: string; name: string }[];
  /**
   * Meta boxes for the right-hand column. When given, the form lays itself out
   * in two columns like the edit page, so creating and editing a product look
   * the same. Everything stays inside this one <form>, so the sidebar's fields
   * post with the rest.
   */
  sidebar?: React.ReactNode;
}) {
  const saveLabel = isNew ? "Create product" : "Save changes";


  /*
   * A page that supplies the sidebar puts Save in its Publish box, so the
   * form's own button rows would be a second copy of the same button. This is
   * decided here rather than at each call site, so no page can forget.
   */
  const withButtons = showButtons && !sidebar;

  const body = (
    <>
      {product?.id ? <input type="hidden" name="id" value={product.id} /> : null}

      {/* Save is reachable without scrolling to the bottom of a long form. */}
      {withButtons ? (
      <div className="flex items-center justify-end gap-3">
        <Link
          href="/admin/products"
          className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </Link>
        <SubmitButton className={`${btnPrimary} px-8`} pendingLabel="Saving…">
          {saveLabel}
        </SubmitButton>
      </div>
      ) : null}

      <SectionCard title="Basic information">
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <NameSlugFields
            defaultName={product?.name ?? ""}
            defaultSlug={product?.slug ?? ""}
            lockOnMount={!isNew}
          />

          {!hideOrganisation ? (
            <>
          {/*
            * Checkboxes rather than a multi-select: a native <select multiple>
            * needs ctrl/cmd-click to pick more than one, which people miss.
            * The first ticked box becomes the primary category, which drives
            * the breadcrumb and the related-products fallback.
            */}
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium text-slate-700">Categories</p>
            {categories.length === 0 ? (
              <p className="text-sm text-slate-500">
                No categories yet — add some under Categories first.
              </p>
            ) : (
              <div className="grid max-h-52 grid-cols-1 gap-1 overflow-y-auto rounded-2xl border border-slate-200 p-3 sm:grid-cols-2">
                {categories.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      name="categoryIds"
                      value={c.id}
                      defaultChecked={
                        product?.categoryIds?.includes(c.id) ??
                        product?.categoryId === c.id
                      }
                      className="h-4 w-4 accent-[#0E7C66]"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">
              The first one ticked is treated as the primary category.
            </p>
          </div>
            </>
          ) : null}

          {!hideOrganisation ? (
          <Field label="Status" htmlFor="status">
            <select
              id="status"
              name="status"
              // New products default to published: the common case is
              // adding something you intend to sell, not a draft.
              defaultValue={product?.status ?? "PUBLISHED"}
              className={fieldSelect}
            >
              <option value="DRAFT">Draft &mdash; not visible</option>
              <option value="PUBLISHED">Published &mdash; live</option>
              <option value="ARCHIVED">Archived &mdash; hidden</option>
            </select>
          </Field>
          ) : null}

        </div>

        <div className="mt-7 space-y-7">
          <DescriptionField
            name="shortDescription"
            label="Short description"
            initialFormat={specFormat(product?.shortFormat)}
            initialHtml={product?.shortDescription ?? ""}
            initialRows={parseSpecTable(product?.shortTable)}
            placeholder="A line or two, shown on listing cards and in search results"
            minHeight={110}
          />

          <DescriptionField
            name="description"
            label="Full description"
            initialFormat={specFormat(product?.descriptionFormat)}
            initialHtml={product?.description ?? ""}
            initialRows={parseSpecTable(product?.descriptionTable)}
            placeholder="Describe the product — headings and bullets are fine"
            minHeight={220}
          />

          {!hideOrganisation ? (
            <label className="flex items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                name="featured"
                defaultChecked={product?.featured ?? false}
                className="h-4 w-4 rounded border-slate-300 text-[#0E7C66] focus:ring-[#0E7C66]"
              />
              Feature on the homepage
            </label>
          ) : null}
        </div>
      </SectionCard>

      {!hideProductData ? (
      <SectionCard title="Product data">
        <AttributesProvider attributes={attributes}>
          <ProductDataPanel
            general={
              <div className="space-y-7">
                <ProductTypeFields
                  defaultType={product?.type ?? "SIMPLE"}
                  defaultUrl={product?.externalUrl ?? ""}
                  defaultLabel={product?.externalLabel ?? ""}
                />

                {isNew ? (
                  <TypeOnly types={["SIMPLE", "EXTERNAL", "GROUPED"]}>
                    <div className="grid grid-cols-2 gap-5 border-t border-slate-100 pt-7">
                      <Field label="Price" htmlFor="price">
                        <input id="price" name="price" placeholder="0.00" className={fieldInput} />
                      </Field>
                      <Field label="Sale price (optional)" htmlFor="salePrice">
                        <input id="salePrice" name="salePrice" placeholder="0.00" className={fieldInput} />
                      </Field>
                    </div>
                  </TypeOnly>
                ) : null}

                <TypeOnly types={["VARIABLE", "GIFT_CARD"]}>
                  <p className="rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-600">
                    A variable product is priced on each of its options. Tick its
                    attributes, then build the options under <strong>Variations</strong>.
                  </p>
                </TypeOnly>
              </div>
            }
            inventory={
              /*
               * One set of stock fields, matching the edit screen. The
               * product-level SKU, status, "manage stock at product level" and
               * quantity that used to sit above these were written to the
               * database and read by nothing, so a product marked out of stock
               * there went on selling. They are gone.
               */
              isNew ? (
                <div className="space-y-7">
                  <label className="flex max-w-xl items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                    <input type="checkbox" name="soldIndividually" className="mt-0.5 h-4 w-4 accent-[#0E7C66]" />
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
                        <Field label="SKU" htmlFor="sku">
                          <input id="sku" name="sku" placeholder="auto" className={fieldInput} />
                        </Field>
                        <Field label="Stock status" htmlFor="stockStatus">
                          <select id="stockStatus" name="stockStatus" defaultValue="IN_STOCK" className={fieldSelect}>
                            {STOCK_STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </Field>
                        <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 sm:col-span-2">
                          <input type="checkbox" name="manageStock" className="mt-0.5 h-4 w-4 accent-[#0E7C66]" />
                          <span className="text-sm text-slate-700">
                            Track quantity
                            <span className="mt-0.5 block text-xs text-slate-500">
                              Off means always in stock, and the quantity,
                              backorder rule and low-stock threshold do not apply.
                            </span>
                          </span>
                        </label>
                        <Field label="Quantity" htmlFor="stock">
                          <input id="stock" name="stock" type="number" min="0" defaultValue="0" className={fieldInput} />
                        </Field>
                        <Field label="Allow backorders" htmlFor="backorders">
                          <select id="backorders" name="backorders" defaultValue="NO" className={fieldSelect}>
                            {BACKORDER_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Low stock threshold" htmlFor="lowStockAmount">
                          <input id="lowStockAmount" name="lowStockAmount" type="number" min="0" placeholder="none" className={fieldInput} />
                        </Field>
                      </div>
                    </div>
                  </TypeOnly>

                  <TypeOnly types={["EXTERNAL"]}>
                    <div className="space-y-5 border-t border-slate-100 pt-7">
                      <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2">
                        <Field label="SKU" htmlFor="skuExternal">
                          <input id="skuExternal" name="sku" placeholder="auto" className={fieldInput} />
                        </Field>
                      </div>
                      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                        Bought on another site, so there is no stock to keep here.
                      </p>
                    </div>
                  </TypeOnly>

                  <TypeOnly types={["GROUPED"]}>
                    <div className="space-y-5 border-t border-slate-100 pt-7">
                      <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2">
                        <Field label="SKU" htmlFor="skuGrouped">
                          <input id="skuGrouped" name="sku" placeholder="auto" className={fieldInput} />
                        </Field>
                      </div>
                      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                        The products in this set each carry their own stock, on
                        their own pages.
                      </p>
                    </div>
                  </TypeOnly>

                  <TypeOnly types={["VARIABLE", "GIFT_CARD"]}>
                    <p className="rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-600">
                      Each option has its own SKU, quantity, status, backorders
                      and low-stock threshold &mdash; set them under{" "}
                      <strong>Variations</strong> as you build them.
                    </p>
                  </TypeOnly>
                </div>
              ) : null
            }

            shipping={
              <div className="space-y-5">
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                  A shipping class groups things that cost the same to post.
                  What each class adds is set under Shop Settings &rsaquo;
                  Shipping.
                </p>
                <Field label="Shipping class" htmlFor="newShippingClass">
                  <select
                    id="newShippingClass"
                    name="shippingClassId"
                    defaultValue=""
                    className={fieldSelect}
                  >
                    <option value="">No shipping class</option>
                    {shippingClasses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
            }
            attributes={<ProductAttributesField section="picker" />}
            variations={<ProductAttributesField section="variations" />}
          />
        </AttributesProvider>
      </SectionCard>
      ) : null}

      {children}

      {/* Always the last section on the page, on create and on edit alike -
          it is reference material, not part of describing the product. On an
          existing product the edit page renders its own copy at the end. */}
      {isNew ? (
      <SectionCard title="Search engine listing">
          <SeoFields
            defaultTitle={product?.seoTitle ?? ""}
            defaultDescription={product?.seoDescription ?? ""}
            context={{
              title: product?.name ?? "",
              sitename: storeName,
              sep: "|",
            }}
            subject={`Product: ${product?.name ?? "new product"}. ${
              product?.shortDescription ?? product?.description ?? ""
            }`}
            urlPrefix={`${SITE_HOST}/products/`}
          />
        </SectionCard>
        ) : null}


      {withButtons ? (
      <div className="flex items-center justify-end gap-3 pb-2">
        <Link
          href="/admin/products"
          className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </Link>
        <SubmitButton className={`${btnPrimary} px-8`} pendingLabel="Saving…">
          {saveLabel}
        </SubmitButton>
      </div>
      ) : null}
    </>
  );

  if (sidebar) {
    return (
      <form id={formId} action={action}>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="min-w-0 space-y-5">{body}</div>
          <aside className="space-y-5 xl:sticky xl:top-4">{sidebar}</aside>
        </div>
      </form>
    );
  }

  return (
    <form id={formId} action={action} className="space-y-5">
      {body}
    </form>
  );
}
