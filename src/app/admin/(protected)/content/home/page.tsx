import type { Metadata } from "next";
import Link from "next/link";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { SectionCard, Field, fieldInput, fieldSelect, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { saveSiteContent, saveStoreTheme } from "../../settings/actions";
import { requireCapability } from "@/lib/permissions";
import { getSiteProduct } from "@/lib/site-product";
import { FAQ_SLOTS, lookOf, mergeSiteContent, SITE_CONTENT_KEY, SITE_DEFAULTS } from "@/lib/site-content";

export const metadata: Metadata = { title: "Home page control" };
export const dynamic = "force-dynamic";

/*
 * Home Page Control for the one-page Br3thr site: every editable word on the
 * homepage, top to bottom, and the colours each flavour is shown in. The
 * product's flavours, sizes, prices and stock stay under Products; payment
 * methods stay under Settings > Payments.
 */
function Text({ name, label, value, hint, wide = false, placeholder }: { name: string; label: string; value: string; hint?: string; wide?: boolean; placeholder?: string }) {
  return (
    <Field label={label} htmlFor={name} hint={hint} className={wide ? "sm:col-span-2" : ""}>
      <input id={name} name={name} defaultValue={value} placeholder={placeholder} className={fieldInput} />
    </Field>
  );
}

function Area({ name, label, value, hint, rows = 2 }: { name: string; label: string; value: string; hint?: string; rows?: number }) {
  return (
    <Field label={label} htmlFor={name} hint={hint} className="sm:col-span-2">
      <textarea id={name} name={name} defaultValue={value} rows={rows} className={fieldTextarea} />
    </Field>
  );
}

function Colour({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <Field label={label} htmlFor={name}>
      <span className="flex items-center gap-3">
        <input id={name} name={name} type="color" defaultValue={value} className="h-11 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" />
        <code className="text-xs text-slate-500">{value}</code>
      </span>
    </Field>
  );
}

const grid = "grid gap-x-5 gap-y-6 sm:grid-cols-2";
const PAY_HINT = "Write {pay} where the payment methods go; it shows what checkout offers right now, e.g. “Interac e-Transfer or crypto”.";

export default async function HomeControlPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireCapability("content");
  const [{ saved }, s, product] = await Promise.all([searchParams, getSettings(), getSiteProduct()]);
  const c = mergeSiteContent(s[SITE_CONTENT_KEY]);
  const flavours = product?.flavours ?? Object.keys(SITE_DEFAULTS.flavours);
  const theme = s[SETTING_KEYS.storeTheme] === "classic" ? "classic" : "br3thr";
  const faqRows = Array.from({ length: FAQ_SLOTS }, (_, i) => c.faq.items[i] ?? { q: "", a: "" });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Home page control</h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700" role="status">
            Saved
          </span>
        ) : null}
        <Link href="/" target="_blank" className="ml-auto text-sm font-medium text-slate-600 underline">View the homepage</Link>
      </div>
      <p className="mb-6 max-w-3xl text-sm text-slate-500">
        Everything the homepage says, top to bottom, and the colours of each flavour. Leave a field blank to go back to the
        site&rsquo;s own wording. Flavours, sizes, prices and stock are edited on the product under Products; payment methods
        under Settings &rarr; Payments.
      </p>

      <form action={saveSiteContent} className="space-y-5">
        <input type="hidden" name="flavourNames" value={JSON.stringify(flavours)} />

        <SectionCard title="1. Flavour colours">
          <p className="mb-5 text-sm text-slate-500">
            Each flavour of the product gets a background (behind the tub in the hero, the &ldquo;inside&rdquo; scene and the
            checkout) and a lid colour on the 3D tub. Keep the background light enough for black text.
          </p>
          <div className="space-y-6">
            {flavours.map((f, i) => {
              const look = lookOf(c, f);
              return (
                <div key={f} className="grid items-end gap-x-5 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <p className="font-medium text-slate-800">{f}</p>
                  <Colour name={`flavour.${i}.ground`} label="Background" value={look.ground} />
                  <Colour name={`flavour.${i}.lid`} label="Lid" value={look.lid} />
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="2. Hero">
          <div className={grid}>
            <Area name="hero.lede" label="Line under the flavour name" value={c.hero.lede} hint="The flavour name, price and buy button come from the product." />
          </div>
        </SectionCard>

        <SectionCard title="3. What's inside (pinned scene, four steps)">
          <div className={grid}>
            <Text name="inside.title" label="Small heading" value={c.inside.title} />
            <div />
            {c.inside.steps.map((st, i) => (
              <div key={i} className="contents">
                <Text name={`inside.${i}.head`} label={`Step ${i + 1}, headline`} value={st.head} />
                <Text name={`inside.${i}.cap`} label={`Step ${i + 1}, text`} value={st.cap} />
              </div>
            ))}
            <Area name="inside.note" label="Small print under the text" value={c.inside.note} />
          </div>
        </SectionCard>

        <SectionCard title="4. One product (statement)">
          <div className={grid}>
            <Text name="statement.title" label="Small heading" value={c.statement.title} />
            <div />
            <Area name="statement.text" label="Statement (large text)" value={c.statement.text} rows={3} />
            <Area name="statement.note" label="Paragraph under it" value={c.statement.note} rows={3} />
          </div>
        </SectionCard>

        <SectionCard title="5. How to take it (three cards)">
          <div className={grid}>
            <Text name="how.title" label="Heading" value={c.how.title} />
            <div />
            {c.how.steps.map((st, i) => (
              <div key={i} className="contents">
                <Text name={`how.${i}.title`} label={`Card ${i + 1}, title`} value={st.title} />
                <Text name={`how.${i}.text`} label={`Card ${i + 1}, text`} value={st.text} />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="6. Checkout heading">
          <div className={grid}>
            <Text name="buy.title" label="Heading" value={c.buy.title} />
            <div />
            <Area name="buy.lede" label="Line under the heading" value={c.buy.lede} hint={PAY_HINT} />
          </div>
          <p className="mt-4 text-xs text-slate-500">The order form itself (flavour, size, address, payment) is unchanged and follows the product and payment settings.</p>
        </SectionCard>

        <SectionCard title="7. Questions">
          <div className={grid}>
            <Text name="faq.title" label="Heading" value={c.faq.title} />
            <div />
          </div>
          <p className="mb-4 mt-5 text-sm text-slate-500">Up to {FAQ_SLOTS} questions, in order. Clear both fields to remove one. {PAY_HINT}</p>
          <div className="space-y-5">
            {faqRows.map((row, i) => (
              <div key={i} className={grid}>
                <Text name={`faq.${i}.q`} label={`Question ${i + 1}`} value={row.q} wide />
                <Area name={`faq.${i}.a`} label={`Answer ${i + 1}`} value={row.a} />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="8. Closing band">
          <div className={grid}>
            <Text name="close.title" label="Headline" value={c.close.title} />
            <Text name="close.text" label="Text beside the button" value={c.close.text} />
          </div>
        </SectionCard>

        <div className="sticky bottom-4 z-10 flex justify-end">
          <button type="submit" className={btnPrimary}>Save homepage</button>
        </div>
      </form>

      <form action={saveStoreTheme} className="mt-8">
        <SectionCard title="Email and admin theme">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full max-w-sm">
              <Field label="Theme for store emails and the admin" htmlFor="storeTheme" hint="Br3thr: emails carry the crest and the admin uses black and gold. Classic: the logo and colours from Settings → Appearance.">
                <select id="storeTheme" name="storeTheme" defaultValue={theme} className={fieldSelect}>
                  <option value="br3thr">Br3thr</option>
                  <option value="classic">Classic (your own colours)</option>
                </select>
              </Field>
            </div>
            <button type="submit" className={btnPrimary}>Save design</button>
          </div>
        </SectionCard>
      </form>
    </>
  );
}
