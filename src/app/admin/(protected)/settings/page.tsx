import type { Metadata } from "next";
import Link from "next/link";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { CURRENCIES, LOCALES } from "@/lib/currency";
import { TIMEZONES } from "@/lib/timezone";
import { SectionCard, Field, fieldInput, fieldSelect, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { saveGeneralSettings } from "./actions";
import { can, requireCapability } from "@/lib/permissions";
import { MediaPicker } from "@/components/admin/MediaPicker";

export const metadata: Metadata = { title: "General settings" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const me = await requireCapability("appearance");
  const [{ saved }, s] = await Promise.all([searchParams, getSettings()]);

  return (
    <form action={saveGeneralSettings} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          General settings
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      <SectionCard title="Store identity">
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label="Store name" htmlFor="storeName">
            <input id="storeName" name="storeName" defaultValue={s[SETTING_KEYS.storeName]} className={fieldInput} />
          </Field>
          <Field label="Tagline" htmlFor="storeTagline">
            <input
              id="storeTagline"
              name="storeTagline"
              defaultValue={s[SETTING_KEYS.storeTagline]}
              placeholder="Shown in the title tag and share cards"
              className={fieldInput}
            />
          </Field>
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            The store logo, what the header shows and the logo&rsquo;s size are set under{" "}
            <Link href="/admin/content/header" className="font-medium text-[var(--admin-accent)] hover:underline">
              Content &rarr; Header
            </Link>
            .
          </p>
          <MediaPicker
            name="faviconUrl"
            label="Favicon"
            defaultValue={s[SETTING_KEYS.faviconUrl]}
            hint="The little icon in the browser tab and in bookmarks. A square PNG or .ico, 32×32 or larger — detail is lost at that size, so a mark reads better than a full logo."
          />
          <Field label="Contact email" htmlFor="contactEmail">
            <input id="contactEmail" name="contactEmail" type="email" defaultValue={s[SETTING_KEYS.contactEmail]} className={fieldInput} />
          </Field>
          <Field label="Contact phone" htmlFor="contactPhone">
            <input id="contactPhone" name="contactPhone" defaultValue={s[SETTING_KEYS.contactPhone]} className={fieldInput} />
          </Field>
        </div>
        <div className="mt-7">
          <Field label="Business address" htmlFor="storeAddress">
            <textarea id="storeAddress" name="storeAddress" rows={3} defaultValue={s[SETTING_KEYS.storeAddress]} className={fieldTextarea} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Currency & formatting">
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label="Store currency" htmlFor="storeCurrency">
            <select id="storeCurrency" name="storeCurrency" defaultValue={s[SETTING_KEYS.storeCurrency]} className={fieldSelect}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Language & number format" htmlFor="storeLocale">
            <select id="storeLocale" name="storeLocale" defaultValue={s[SETTING_KEYS.storeLocale]} className={fieldSelect}>
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Time zone" htmlFor="storeTimezone">
            <select
              id="storeTimezone"
              name="storeTimezone"
              defaultValue={s[SETTING_KEYS.storeTimezone]}
              className={fieldSelect}
            >
              {TIMEZONES.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="mt-3 px-5 text-xs text-slate-400">
          Currency drives every price shown across the admin. Existing orders keep
          the currency they were placed in, so past records never change retroactively.
          Timestamps are stored in UTC and shown in the time zone above, so
          &ldquo;today&rdquo; on the dashboard means today where the shop is.
        </p>
      </SectionCard>

      {/* Taking the shop offline is not a design decision, so it stays with
          the roles that own the shop rather than the ones that style it. The
          server ignores the field for anyone else regardless of this. */}
      {can(me.role, "settings") ? (
      <SectionCard title="Availability">
        <label className="flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="maintenanceMode"
            defaultChecked={s[SETTING_KEYS.maintenanceMode] === "1"}
            className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
          />
          Put the storefront into maintenance mode
        </label>
        <p className="mt-2 text-xs text-slate-400">
          The admin stays reachable while maintenance mode is on.
        </p>
      </SectionCard>
      ) : null}

      <SectionCard title="Custom CSS">
        <div className="space-y-7">
          <Field label="Storefront CSS" htmlFor="customCss">
            <textarea
              id="customCss"
              name="customCss"
              rows={12}
              spellCheck={false}
              defaultValue={s[SETTING_KEYS.customCss]}
              placeholder={".product-card { border-radius: 4px; }"}
              className={`${fieldTextarea} font-mono text-[13px] leading-relaxed`}
            />
          </Field>

          <Field label="Admin panel CSS" htmlFor="adminCustomCss">
            <textarea
              id="adminCustomCss"
              name="adminCustomCss"
              rows={8}
              spellCheck={false}
              defaultValue={s[SETTING_KEYS.adminCustomCss]}
              placeholder={".admin-table th { text-transform: none; }"}
              className={`${fieldTextarea} font-mono text-[13px] leading-relaxed`}
            />
          </Field>
        </div>

        <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-500">
          <p>
            Loaded <strong className="text-slate-700">after</strong> the theme,
            so a plain rule beats the built-in one without needing{" "}
            <code className="rounded bg-white px-1">!important</code>. Invalid
            CSS is ignored by the browser rather than breaking the page, and{" "}
            <code className="rounded bg-white px-1">@import</code> works if you
            need a web font.
          </p>
          <p className="mt-2.5">
            These brand variables are already defined, so overriding one
            re-colours everything that uses it:{" "}
            <code className="rounded bg-white px-1">--brand</code>,{" "}
            <code className="rounded bg-white px-1">--brand-dark</code>,{" "}
            <code className="rounded bg-white px-1">--brand-surface</code>,{" "}
            <code className="rounded bg-white px-1">--brand-highlight</code>{" "}
            (plus <code className="rounded bg-white px-1">-hover</code>,{" "}
            <code className="rounded bg-white px-1">-light</code>,{" "}
            <code className="rounded bg-white px-1">-soft</code>,{" "}
            <code className="rounded bg-white px-1">-deep</code>,{" "}
            <code className="rounded bg-white px-1">-deeper</code>,{" "}
            <code className="rounded bg-white px-1">-darkest</code> and a{" "}
            <code className="rounded bg-white px-1">-rgb</code> triplet of each).
            The admin box has{" "}
            <code className="rounded bg-white px-1">--admin-sidebar</code>,{" "}
            <code className="rounded bg-white px-1">--admin-accent</code> and{" "}
            <code className="rounded bg-white px-1">--admin-heading</code>.
          </p>
          <p className="mt-2.5 text-amber-700">
            A mistake here is visible to shoppers immediately. Check the site
            after saving &mdash; emptying the box restores the original design.
          </p>
        </div>
      </SectionCard>

      <div className="flex justify-end pb-2">
        <button type="submit" className={`${btnPrimary} px-8`}>
          Save settings
        </button>
      </div>
    </form>
  );
}
