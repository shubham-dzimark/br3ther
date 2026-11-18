import type { Metadata } from "next";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { SectionCard, Field, fieldInput } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { saveStoreSettings } from "../actions";
import { requireCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getShopHero } from "@/lib/shop-hero";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { fieldTextarea } from "@/components/admin/Field";

export const metadata: Metadata = { title: "Shop settings" };
export const dynamic = "force-dynamic";

export default async function ShopSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("settings");
  const [{ saved }, s, hero, categories] = await Promise.all([
    searchParams,
    getSettings(),
    getShopHero(),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: {
        slug: true,
        name: true,
        _count: { select: { products: { where: { status: "PUBLISHED" } } } },
      },
    }),
  ]);
  const chosen = new Set(hero.categorySlugs);

  return (
    <form action={saveStoreSettings} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Shop settings
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      <SectionCard title="Shop page header">
        <p className="mb-6 text-xs leading-relaxed text-slate-500">
          The band across the top of <code className="rounded bg-slate-100 px-1">/shop</code>.
          Leave a field empty and the page falls back to what it shows today, so
          nothing here has to be filled in.
        </p>

        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label="Title" htmlFor="shopHeroTitle">
            <input
              id="shopHeroTitle"
              name="shopHeroTitle"
              defaultValue={hero.title}
              placeholder="Shop"
              className={fieldInput}
            />
          </Field>
          <Field label="Small text under the title" htmlFor="shopHeroSubtitle">
            <input
              id="shopHeroSubtitle"
              name="shopHeroSubtitle"
              defaultValue={hero.subtitle}
              placeholder="Defaults to the product count"
              className={fieldInput}
            />
          </Field>
        </div>

        <div className="mt-7">
          <p className="mb-2 text-sm font-medium text-slate-700">
            Categories to show as buttons
          </p>
          <p className="mb-3 text-xs text-slate-500">
            Tick none to show every category. Clicking one filters the grid and
            jumps straight to it.
          </p>
          {categories.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              No categories yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {categories.map((c) => (
                <label
                  key={c.slug}
                  className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-2.5 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    name="shopHeroCategories"
                    value={c.slug}
                    defaultChecked={chosen.has(c.slug)}
                    className="h-4 w-4 accent-[var(--admin-accent)]"
                  />
                  {c.name}
                  <span className="ml-auto text-xs text-slate-400">
                    {c._count.products}
                  </span>
                </label>
              ))}
            </div>
          )}

          <label className="mt-3 flex items-center gap-3 text-xs text-slate-500">
            <input
              type="checkbox"
              name="shopHeroShowCounts"
              defaultChecked={hero.showCounts}
              className="h-4 w-4 accent-[var(--admin-accent)]"
            />
            Show how many products are in each category
          </label>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label="Background colour (hex, optional)" htmlFor="shopHeroBg">
            <input
              id="shopHeroBg"
              name="shopHeroBg"
              defaultValue={hero.bg}
              placeholder="#0F2E26"
              className={fieldInput}
            />
          </Field>
          <Field label="Text colour (hex, optional)" htmlFor="shopHeroText">
            <input
              id="shopHeroText"
              name="shopHeroText"
              defaultValue={hero.text}
              placeholder="#ffffff"
              className={fieldInput}
            />
          </Field>
        </div>

        <div className="mt-7">
          <MediaPicker
            name="shopHeroImage"
            label="Background image (optional)"
            defaultValue={hero.image}
            hint="Sits behind the title and buttons. Set a text colour that reads against it."
          />
        </div>
      </SectionCard>

      {/* Shipping moved to Shop Settings › Shipping, where methods, costs and
          classes are set. The two fields that lived here are what it replaced. */}
      <p className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
        Shipping rates are set under{" "}
        <a href="/admin/settings/shipping" className="font-medium text-[var(--admin-accent)] hover:underline">
          Shop Settings &rsaquo; Shipping
        </a>
        .
      </p>

      <div className="flex justify-end pb-2">
        <button type="submit" className={`${btnPrimary} px-8`}>
          Save settings
        </button>
      </div>
    </form>
  );
}
