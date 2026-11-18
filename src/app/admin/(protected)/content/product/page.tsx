import type { Metadata } from "next";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { SectionCard, Field, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { requireCapability } from "@/lib/permissions";
import { saveProductPageSettings } from "../../settings/actions";

export const metadata: Metadata = { title: "Product page" };
export const dynamic = "force-dynamic";

export default async function ProductPageControl({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("content");
  const [{ saved }, s] = await Promise.all([searchParams, getSettings()]);

  return (
    <form action={saveProductPageSettings} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Product page</h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      <SectionCard title="Beside the buy buttons">
        <p className="mb-7 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
          The two lines under <strong>Buy It Now</strong>. Basic formatting is
          allowed &mdash; <code>&lt;b&gt;</code> for the part you want to stand out.
        </p>
        <div className="grid grid-cols-1 gap-y-7">
          <Field label="Delivery estimate" htmlFor="productDeliveryNote">
            <input
              id="productDeliveryNote"
              name="productDeliveryNote"
              className={fieldInput}
              defaultValue={s[SETTING_KEYS.productDeliveryNote]}
            />
          </Field>
          <Field label="Return window" htmlFor="productReturnsNote">
            <input
              id="productReturnsNote"
              name="productReturnsNote"
              className={fieldInput}
              defaultValue={s[SETTING_KEYS.productReturnsNote]}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Shoppers viewing">
        <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            name="productViewersLine"
            defaultChecked={s[SETTING_KEYS.productViewersLine] === "1"}
            className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
          />
          Show &ldquo;N people are viewing this right now&rdquo;
        </label>
        <p className="mt-2 px-1 text-xs text-slate-400">
          Nothing on this site counts who is on a page, so the number is an
          estimate that moves through the day &mdash; not a live count. Leave it
          off if you would rather not make that claim.
        </p>
      </SectionCard>

      <SectionCard title="Size guide">
        <p className="mb-7 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
          Opens in a dialog from the <strong>Size</strong> row. Paste a table
          here &mdash; leave it empty and the link is hidden.
        </p>
        <Field label="Size chart (HTML)" htmlFor="productSizeGuide">
          <textarea
            id="productSizeGuide"
            name="productSizeGuide"
            rows={8}
            className={fieldTextarea}
            defaultValue={s[SETTING_KEYS.productSizeGuide]}
            placeholder="<table>...</table>"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Tabs under the gallery">
        <p className="mb-7 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
          In <strong>Shipping &amp; Returns</strong> each <code>&lt;h3&gt;</code>
          starts a new column, up to four across. <strong>Return Policies</strong>
          reads straight down the page.
        </p>
        <div className="grid grid-cols-1 gap-y-7">
          <Field label="Shipping &amp; Returns" htmlFor="productShippingTab">
            <textarea
              id="productShippingTab"
              name="productShippingTab"
              rows={8}
              className={fieldTextarea}
              defaultValue={s[SETTING_KEYS.productShippingTab]}
            />
          </Field>
          <Field label="Return Policies" htmlFor="productReturnsTab">
            <textarea
              id="productReturnsTab"
              name="productReturnsTab"
              rows={8}
              className={fieldTextarea}
              defaultValue={s[SETTING_KEYS.productReturnsTab]}
            />
          </Field>
          <Field label="Heading over the product's spec rows" htmlFor="productCareTitle">
            <input
              id="productCareTitle"
              name="productCareTitle"
              className={fieldInput}
              defaultValue={s[SETTING_KEYS.productCareTitle]}
            />
          </Field>
        </div>
      </SectionCard>

      <div className="flex justify-end pb-2">
        <button type="submit" className={`${btnPrimary} px-8`}>
          Save product page
        </button>
      </div>
    </form>
  );
}
