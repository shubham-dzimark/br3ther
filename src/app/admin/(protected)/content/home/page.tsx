import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { CATEGORY_ORDER } from "@/lib/category-order";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { SectionCard, Field, fieldInput, fieldSelect, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { saveGfHome, saveStoreTheme } from "../../settings/actions";
import { requireCapability } from "@/lib/permissions";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { GF_FEATURE_ICONS, GF_HOME_KEY, mergeGfHome } from "@/lib/gf-home";

export const metadata: Metadata = { title: "Home page control" };
export const dynamic = "force-dynamic";

/* One switch per homepage section, in the card's header. */
function Show({ name, on }: { name: string; on: boolean }) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
      <input type="checkbox" name={name} defaultChecked={on} className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]" />
      Show on homepage
    </label>
  );
}

function Text({ name, label, value, hint, wide = false }: { name: string; label: string; value: string; hint?: string; wide?: boolean }) {
  return (
    <Field label={label} htmlFor={name} hint={hint} className={wide ? "sm:col-span-2" : ""}>
      <input id={name} name={name} defaultValue={value} className={fieldInput} />
    </Field>
  );
}

function Area({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <Field label={label} htmlFor={name} className="sm:col-span-2">
      <textarea id={name} name={name} defaultValue={value} rows={2} className={fieldTextarea} />
    </Field>
  );
}

const grid = "grid gap-x-5 gap-y-6 sm:grid-cols-2";

export default async function HomeControlPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireCapability("content");
  const [{ saved }, s, featuredCount, categories] = await Promise.all([
    searchParams,
    getSettings(),
    prisma.product.count({ where: { featured: true, status: "PUBLISHED" } }),
    prisma.category.findMany({ where: { parentId: null }, orderBy: CATEGORY_ORDER, select: { slug: true, name: true } }),
  ]);
  const h = mergeGfHome(s[GF_HOME_KEY]);
  const theme = s[SETTING_KEYS.storeTheme] === "classic" ? "classic" : "br3thr";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Home page control</h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700" role="status">
            Saved
          </span>
        ) : null}
      </div>
      <p className="mb-6 max-w-3xl text-sm text-slate-500">
        Every section of the homepage, top to bottom. Leave a field blank to use the design&rsquo;s own wording, and untick a section to hide it.
      </p>

      <form action={saveGfHome} className="space-y-5">
        <SectionCard title="1. Hero" action={<Show name="hero.show" on={h.hero.show} />}>
          <div className={grid}>
            <Text name="hero.eyebrow" label="Small heading" value={h.hero.eyebrow} />
            <Text name="hero.line1" label="Headline, white line" value={h.hero.line1} />
            <Text name="hero.line2" label="Headline, gold line" value={h.hero.line2} />
            <Text name="hero.ctaLabel" label="Button text" value={h.hero.ctaLabel} />
            <Area name="hero.text" label="Text under the headline" value={h.hero.text} />
            <Text name="hero.ctaHref" label="Button link" value={h.hero.ctaHref} hint="A page on the shop, e.g. /shop or /shop?category=cigars" />
            <div />
            <Text name="hero.badge0" label="Badge 1 (diamond)" value={h.hero.badges[0]} />
            <Text name="hero.badge1" label="Badge 2 (truck)" value={h.hero.badges[1]} />
            <Text name="hero.badge2" label="Badge 3 (shield)" value={h.hero.badges[2]} />
            <div className="sm:col-span-2">
              <MediaPicker name="hero.image" label="Hero photo" defaultValue={h.hero.image} hint="Fills the right side and fades into black. A wide photo works best." />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="2. Explore our collection (categories)" action={<Show name="categories.show" on={h.categories.show} />}>
          <div className={grid}>
            <Text name="categories.eyebrow" label="Small heading" value={h.categories.eyebrow} />
            <Text name="categories.title" label="Title" value={h.categories.title} />
            <Field label="How many categories" htmlFor="categories.count">
              <select id="categories.count" name="categories.count" defaultValue={String(h.categories.count)} className={fieldSelect}>
                {[2, 3, 4, 5, 6, 8].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
            <Text
              name="categories.slugs"
              label="Which categories (optional)"
              value={h.categories.slugs}
              hint={`Category URL names separated by commas, in order. Blank shows the first ones from Categories. Yours: ${categories.map((c) => c.slug).join(", ") || "none yet"}.`}
            />
          </div>
          <p className="mt-4 text-xs text-slate-500">Each card uses the category&rsquo;s own photo and subtitle, set under Products &rarr; Categories.</p>
        </SectionCard>

        <SectionCard title="3. Featured products" action={<Show name="featured.show" on={h.featured.show} />}>
          <div className={grid}>
            <Text name="featured.eyebrow" label="Small heading" value={h.featured.eyebrow} />
            <Text name="featured.title" label="Title" value={h.featured.title} />
            <Text name="featured.linkLabel" label="Link text" value={h.featured.linkLabel} />
            <Text name="featured.linkHref" label="Link" value={h.featured.linkHref} />
            <Field label="How many products" htmlFor="featured.count">
              <select id="featured.count" name="featured.count" defaultValue={String(h.featured.count)} className={fieldSelect}>
                {[4, 8, 12].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Shows products marked &ldquo;Featured&rdquo; ({featuredCount} now), topped up with the newest. Tick Featured on a product to put it here.
          </p>
        </SectionCard>

        <SectionCard title="4. Offer banner" action={<Show name="promo.show" on={h.promo.show} />}>
          <div className={grid}>
            <Text name="promo.eyebrow" label="Small heading" value={h.promo.eyebrow} />
            <Text name="promo.title" label="Title" value={h.promo.title} />
            <Text name="promo.highlight" label="Red line" value={h.promo.highlight} />
            <Text name="promo.ctaLabel" label="Button text" value={h.promo.ctaLabel} />
            <Area name="promo.text" label="Text" value={h.promo.text} />
            <Text name="promo.ctaHref" label="Button link" value={h.promo.ctaHref} />
            <div className="sm:col-span-2">
              <MediaPicker name="promo.image" label="Banner photo" defaultValue={h.promo.image} hint="Sits on the left and fades into the text side." />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="5. Promise row" action={<Show name="features.show" on={h.features.show} />}>
          <div className="space-y-5">
            {h.features.items.map((f, i) => (
              <div key={i} className="grid gap-x-5 gap-y-6 sm:grid-cols-[160px_1fr_1fr]">
                <Field label={`Icon ${i + 1}`} htmlFor={`features.${i}.icon`}>
                  <select id={`features.${i}.icon`} name={`features.${i}.icon`} defaultValue={f.icon} className={fieldSelect}>
                    {GF_FEATURE_ICONS.map((icon) => (
                      <option key={icon} value={icon}>{icon}</option>
                    ))}
                  </select>
                </Field>
                <Text name={`features.${i}.title`} label="Title" value={f.title} />
                <Text name={`features.${i}.text`} label="Text" value={f.text} />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="6. Testimonials" action={<Show name="testimonials.show" on={h.testimonials.show} />}>
          <div className={grid}>
            <Text name="testimonials.eyebrow" label="Small heading" value={h.testimonials.eyebrow} />
            <Text name="testimonials.title" label="Title" value={h.testimonials.title} />
            <Field label="What to show" htmlFor="testimonials.source" className="sm:col-span-2">
              <select id="testimonials.source" name="testimonials.source" defaultValue={h.testimonials.source} className={fieldSelect}>
                <option value="reviews">The 3 newest approved customer reviews (these quotes if there are fewer than 3)</option>
                <option value="custom">Always these quotes</option>
              </select>
            </Field>
            {h.testimonials.items.map((t, i) => (
              <div key={i} className="grid gap-x-5 gap-y-6 sm:col-span-2 sm:grid-cols-[1fr_220px]">
                <Text name={`testimonials.${i}.body`} label={`Quote ${i + 1}`} value={t.body} />
                <Text name={`testimonials.${i}.name`} label="Name" value={t.name} />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="7. Br3thr Club signup" action={<Show name="club.show" on={h.club.show} />}>
          <div className={grid}>
            <Text name="club.titleStart" label="Title, start" value={h.club.titleStart} />
            <Text name="club.titleAccent" label="Title, gold word" value={h.club.titleAccent} />
            <Text name="club.titleEnd" label="Title, end" value={h.club.titleEnd} />
            <Text name="club.button" label="Button text" value={h.club.button} />
            <Area name="club.text" label="Text" value={h.club.text} />
            <Text name="club.placeholder" label="Email field placeholder" value={h.club.placeholder} />
            <div />
            <MediaPicker name="club.left" label="Left photo" defaultValue={h.club.left} />
            <MediaPicker name="club.right" label="Right photo" defaultValue={h.club.right} />
          </div>
          <p className="mt-4 text-xs text-slate-500">This band also appears on the shop, product and cart pages.</p>
        </SectionCard>

        <div className="sticky bottom-4 z-10 flex justify-end">
          <button type="submit" className={btnPrimary}>Save homepage</button>
        </div>
      </form>

      <form action={saveStoreTheme} className="mt-8">
        <SectionCard title="Storefront design">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full max-w-sm">
              <Field label="Design the shop shows" htmlFor="storeTheme">
                <select id="storeTheme" name="storeTheme" defaultValue={theme} className={fieldSelect}>
                  <option value="br3thr">Br3thr (dark)</option>
                  <option value="classic">Classic (previous design)</option>
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
