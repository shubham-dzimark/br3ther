import { SITE_HOST } from "@/lib/site";
import type { Metadata } from "next";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { SectionCard, Field, fieldInput, fieldSelect, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { saveSeoSettings } from "../actions";
import { requireCapability } from "@/lib/permissions";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { SeoFields } from "@/components/admin/SeoFields";
import { searchConsoleToken } from "@/lib/seo-meta";

export const metadata: Metadata = { title: "SEO settings" };
export const dynamic = "force-dynamic";

export default async function SeoSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("settings");
  const [{ saved }, s] = await Promise.all([searchParams, getSettings()]);

  return (
    <form action={saveSeoSettings} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          SEO settings
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      <SettingsTabs
        tabs={[
          {
            id: "listing",
            label: "Site listing",
            content: (
              <>
              <SectionCard title="Search engine listing">
                {/*
                  The site-wide fallback: used on any page that has not set its own.
                  Variables work here too, so "%%title%% %%sep%% %%sitename%%" gives
                  every page a consistent shape without repeating the shop name by hand.
                */}
                <SeoFields
                  titleName="seoMetaTitle"
                  descriptionName="seoMetaDescription"
                  defaultTitle={s[SETTING_KEYS.seoMetaTitle] ?? ""}
                  defaultDescription={s[SETTING_KEYS.seoMetaDescription] ?? ""}
                  context={{
                    title: s[SETTING_KEYS.storeName] || "Br3thr",
                    sitename: s[SETTING_KEYS.storeName] || "Br3thr",
                    sep: "|",
                    excerpt: s[SETTING_KEYS.storeTagline] ?? "",
                  }}
                  subject={`Premium cigar and lifestyle shop: ${s[SETTING_KEYS.storeName] || "Br3thr"}. ${s[SETTING_KEYS.storeTagline] ?? ""}`}
                  urlPrefix={SITE_HOST}
                />
                <div className="mt-7 space-y-7">

                  <MediaPicker
                    name="seoOgImage"
                    label="Social share image"
                    defaultValue={s[SETTING_KEYS.seoOgImage]}
                    hint="1200 × 630 is the size Facebook, X and LinkedIn expect."
                  />

                  <Field label="Robots directive" htmlFor="seoRobots">
                    <select id="seoRobots" name="seoRobots" defaultValue={s[SETTING_KEYS.seoRobots]} className={fieldSelect}>
                      <option value="index,follow">index, follow — visible to search engines</option>
                      <option value="noindex,follow">noindex, follow — hidden from results</option>
                      <option value="noindex,nofollow">noindex, nofollow — fully hidden</option>
                    </select>
                  </Field>
                  <p className="-mt-5 px-5 text-xs text-slate-400">
                    Keep this on <strong>index, follow</strong> once you launch. The admin is
                    always noindex regardless of this setting.
                  </p>

                                </div>
              </SectionCard>
              </>
            ),
          },
          {
            id: "sitemap",
            label: "Sitemap",
            content: (
              <SectionCard title="Sitemap">
                                            <p className="mb-5 text-xs text-slate-500">
                        Published at{" "}
                        <a
                          href="/sitemap.xml"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[var(--admin-accent)] hover:underline"
                        >
                          /sitemap.xml
                        </a>{" "}
                        and linked from robots.txt. Only published products and pages are
                        ever listed.
                      </p>

                      <div className="space-y-3">
                        {[
                          ["sitemapEnabled", "Publish a sitemap", SETTING_KEYS.sitemapEnabled],
                          ["sitemapProducts", "Include products", SETTING_KEYS.sitemapProducts],
                          ["sitemapCategories", "Include categories", SETTING_KEYS.sitemapCategories],
                          ["sitemapPages", "Include content pages", SETTING_KEYS.sitemapPages],
                          ["sitemapBlog", "Include blog posts", SETTING_KEYS.sitemapBlog],
                          [
                            "sitemapBlogCategories",
                            "Include blog categories",
                            SETTING_KEYS.sitemapBlogCategories,
                          ],
                        ].map(([name, label, key]) => (
                          <label
                            key={name}
                            className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              name={name}
                              defaultChecked={s[key] !== "0"}
                              className="h-4 w-4 accent-[var(--admin-accent)]"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
              </SectionCard>
            ),
          },
          {
            id: "tpl-intro",
            label: "Search appearance",
            content: (
              <SectionCard title="How defaults work">
                <p className="text-sm leading-relaxed text-slate-600">
                  Each content type below has a default title and description
                  used by every item of that type. An individual product, post
                  or page that has its own SEO fields keeps them &mdash; these
                  only fill in for the ones that do not, which is most of them.
                </p>
                <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-4 text-xs leading-relaxed text-slate-600">
                  <p className="mb-2 font-semibold text-slate-800">Variables</p>
                  <p>
                    <code className="rounded bg-white px-1">%%title%%</code>{" "}
                    the item&rsquo;s name &middot;{" "}
                    <code className="rounded bg-white px-1">%%sitename%%</code>{" "}
                    your shop &middot;{" "}
                    <code className="rounded bg-white px-1">%%sep%%</code> the
                    divider &middot;{" "}
                    <code className="rounded bg-white px-1">%%category%%</code>{" "}
                    &middot;{" "}
                    <code className="rounded bg-white px-1">%%excerpt%%</code>{" "}
                    &middot;{" "}
                    <code className="rounded bg-white px-1">%%price%%</code>{" "}
                    products only.
                  </p>
                  <p className="mt-2">
                    A variable with nothing to fill it collapses along with the
                    separator beside it, so an item with no category never
                    renders a gap where one should have been.
                  </p>
                </div>
              </SectionCard>
            ),
          },
          {
            id: "products",
            label: "Products",
            content: (
              <SectionCard title="Products">
                <p className="mb-6 text-sm text-slate-500">
                  The default search listing for every product.
                </p>
                <SeoFields
                  titleName="tplProductTitle"
                  descriptionName="tplProductDescription"
                  defaultTitle={s[SETTING_KEYS.seoTplProductTitle] ?? ""}
                  defaultDescription={s[SETTING_KEYS.seoTplProductDescription] ?? ""}
                  subject="Products"
                  context={{
                    title: "Mens Gym Stringer Tank Top",
                    sitename: s[SETTING_KEYS.storeName] || "Br3thr",
                    sep: "|",
                    category: "Activewear Men",
                    excerpt: "A short description of the item goes here.",
                    price: "$80 CAD",
                  }}
                />
              </SectionCard>
            ),
          },
          {
            id: "categories",
            label: "Product categories",
            content: (
              <SectionCard title="Product categories">
                <p className="mb-6 text-sm text-slate-500">
                  The default search listing for every product category page
                  (/shop?category=…).
                </p>
                <SeoFields
                  titleName="tplCategoryTitle"
                  descriptionName="tplCategoryDescription"
                  defaultTitle={s[SETTING_KEYS.seoTplCategoryTitle] ?? ""}
                  defaultDescription={s[SETTING_KEYS.seoTplCategoryDescription] ?? ""}
                  subject="Product categories"
                  context={{
                    title: "Activewear Men",
                    sitename: s[SETTING_KEYS.storeName] || "Br3thr",
                    sep: "|",
                    category: "Activewear Men",
                    excerpt: "A short description of the item goes here.",
                    price: "$80 CAD",
                  }}
                />
              </SectionCard>
            ),
          },
          {
            id: "posts",
            label: "Blog posts",
            content: (
              <SectionCard title="Blog posts">
                <p className="mb-6 text-sm text-slate-500">
                  The default search listing for every blog post.
                </p>
                <SeoFields
                  titleName="tplPostTitle"
                  descriptionName="tplPostDescription"
                  defaultTitle={s[SETTING_KEYS.seoTplPostTitle] ?? ""}
                  defaultDescription={s[SETTING_KEYS.seoTplPostDescription] ?? ""}
                  subject="Blog posts"
                  context={{
                    title: "How to pick your size",
                    sitename: s[SETTING_KEYS.storeName] || "Br3thr",
                    sep: "|",
                    category: "Activewear Men",
                    excerpt: "A short description of the item goes here.",
                    price: "$80 CAD",
                  }}
                />
              </SectionCard>
            ),
          },
          {
            id: "blogcats",
            label: "Blog categories",
            content: (
              <SectionCard title="Blog categories">
                <p className="mb-6 text-sm text-slate-500">
                  The default search listing for every blog category.
                </p>
                <SeoFields
                  titleName="tplBlogCategoryTitle"
                  descriptionName="tplBlogCategoryDescription"
                  defaultTitle={s[SETTING_KEYS.seoTplBlogCategoryTitle] ?? ""}
                  defaultDescription={s[SETTING_KEYS.seoTplBlogCategoryDescription] ?? ""}
                  subject="Blog categories"
                  context={{
                    title: "Training",
                    sitename: s[SETTING_KEYS.storeName] || "Br3thr",
                    sep: "|",
                    category: "Activewear Men",
                    excerpt: "A short description of the item goes here.",
                    price: "$80 CAD",
                  }}
                />
              </SectionCard>
            ),
          },
          {
            id: "pages",
            label: "Content pages",
            content: (
              <SectionCard title="Content pages">
                <p className="mb-6 text-sm text-slate-500">
                  The default search listing for every content page.
                </p>
                <SeoFields
                  titleName="tplPageTitle"
                  descriptionName="tplPageDescription"
                  defaultTitle={s[SETTING_KEYS.seoTplPageTitle] ?? ""}
                  defaultDescription={s[SETTING_KEYS.seoTplPageDescription] ?? ""}
                  subject="Content pages"
                  context={{
                    title: "Shipping Policy",
                    sitename: s[SETTING_KEYS.storeName] || "Br3thr",
                    sep: "|",
                    category: "Activewear Men",
                    excerpt: "A short description of the item goes here.",
                    price: "$80 CAD",
                  }}
                />
              </SectionCard>
            ),
          },
          {
            id: "verification",
            label: "Verification",
            content: (
              <>
              <SectionCard title="Verification">
                <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  Google Analytics, Tag Manager and the ad pixels live under{" "}
                  <strong className="text-slate-900">3rd party setup &rarr; Marketing tools</strong>.
                  They used to be settable here too, which meant one copy silently did nothing.
                </p>
                <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
                  <Field label="Search Console verification" htmlFor="seoSearchConsole">
                    <input
                      id="seoSearchConsole"
                      name="seoSearchConsole"
                      defaultValue={s[SETTING_KEYS.seoSearchConsole]}
                      placeholder="Paste the code or the whole <meta> tag"
                      className={fieldInput}
                    />
                  </Field>
                </div>
                {s[SETTING_KEYS.seoSearchConsole] && !searchConsoleToken(s[SETTING_KEYS.seoSearchConsole]) ? (
                  <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    This value is not a Search Console code, so it is not being added to
                    the site. Paste the HTML tag Search Console shows under
                    &ldquo;HTML tag&rdquo;.
                  </p>
                ) : null}
                <p className="mt-3 px-5 text-xs text-slate-400">
                  Added to every storefront page&rsquo;s &lt;head&gt; as
                  google-site-verification. In Search Console choose the
                  &ldquo;HTML tag&rdquo; method, paste it here, save, then press
                  Verify there. The robots directive above also applies to every
                  storefront page; the admin is always hidden.
                </p>
              </SectionCard>
              </>
            ),
          },
        ]}
      />

      <div className="flex justify-end pb-2">
        <button type="submit" className={`${btnPrimary} px-8`}>
          Save SEO settings
        </button>
      </div>
    </form>
  );
}
