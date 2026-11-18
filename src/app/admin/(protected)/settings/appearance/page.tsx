import type { Metadata } from "next";
import { isBr3thrTheme } from "@/lib/brand-content";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { requireCapability } from "@/lib/permissions";
import { SectionCard, Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { btnPrimary } from "@/components/admin/ui";
import { saveAppearanceSettings } from "../actions";

export const metadata: Metadata = { title: "Appearance" };
import { ColourScheme } from "@/components/admin/ColourScheme";

export const dynamic = "force-dynamic";

const STOREFRONT_SWATCHES = [
  { label: "Holographic logo (default)", sidebar: "#7B2FF7", accent: "#0D0A1C", heading: "#FFC400" },
  { label: "Deep green", sidebar: "#0F2E26", accent: "#0F2E26", heading: "#F2A81D" },
  { label: "Indigo", sidebar: "#4F46E5", accent: "#1E1B4B", heading: "#FBBF24" },
  { label: "Crimson", sidebar: "#BE123C", accent: "#4C0519", heading: "#FDE68A" },
  { label: "Royal blue", sidebar: "#2563EB", accent: "#0C2340", heading: "#F59E0B" },
  { label: "Forest", sidebar: "#166534", accent: "#052E16", heading: "#FACC15" },
];

const SWATCHES = [
  { label: "Ocean (default)", sidebar: "#123C5E", accent: "#1A6FB5", heading: "#7FA6C7" },
  { label: "Ember", sidebar: "#4E2C24", accent: "#B4552F", heading: "#C79A82" },
  { label: "Teal (old default)", sidebar: "#123C5E", accent: "#0E7C66", heading: "#F0B429" },
  { label: "Midnight", sidebar: "#111827", accent: "#4F46E5", heading: "#FBBF24" },
  { label: "Plum", sidebar: "#3B0764", accent: "#9333EA", heading: "#FDE68A" },
  { label: "Ink blue", sidebar: "#0C2340", accent: "#2563EB", heading: "#F59E0B" },
  { label: "Charcoal", sidebar: "#1F2937", accent: "#059669", heading: "#FCD34D" },
];

export default async function AppearancePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("appearance");
  const [{ saved }, s] = await Promise.all([searchParams, getSettings()]);

  const brandText = s[SETTING_KEYS.adminBrandText] || s[SETTING_KEYS.storeName];

  return (
    <form action={saveAppearanceSettings} className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Appearance
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      <SectionCard title="Admin branding">
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label="Brand name" htmlFor="adminBrandText">
            <input
              id="adminBrandText"
              name="adminBrandText"
              defaultValue={s[SETTING_KEYS.adminBrandText]}
              placeholder={s[SETTING_KEYS.storeName] || "Br3thr"}
              className={fieldInput}
            />
          </Field>
          <Field label="Show" htmlFor="adminBrandMode">
            <select
              id="adminBrandMode"
              name="adminBrandMode"
              defaultValue={s[SETTING_KEYS.adminBrandMode]}
              className={fieldSelect}
            >
              <option value="both">Logo and name</option>
              <option value="image">Logo only</option>
              <option value="text">Name only</option>
            </select>
          </Field>
        </div>

        <div className="mt-7">
          <MediaPicker
            name="adminLogoUrl"
            label="Admin logo"
            defaultValue={s[SETTING_KEYS.adminLogoUrl]}
            hint="Shown top-left in the sidebar. A square or wide transparent PNG/SVG works best. Leave empty to use the initial in a circle."
          />
        </div>

        <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Currently showing:{" "}
          <strong className="text-slate-700">
            {s[SETTING_KEYS.adminBrandMode] === "image"
              ? "logo only"
              : s[SETTING_KEYS.adminBrandMode] === "text"
                ? `“${brandText}” only`
                : `logo and “${brandText}”`}
          </strong>
          . This is the admin panel only &mdash; the storefront logo lives in
          General settings.
        </p>
      </SectionCard>

      <SectionCard title="Colours">
        <ColourScheme
          swatches={SWATCHES}
          fields={[
            { key: "sidebar", name: "adminSidebarColor", label: "Sidebar" },
            { key: "accent", name: "adminAccentColor", label: "Accent (buttons, active items)" },
            { key: "heading", name: "adminHeadingColor", label: "Sidebar section headings" },
          ]}
          initial={{
            sidebar: s[SETTING_KEYS.adminSidebarColor],
            accent: s[SETTING_KEYS.adminAccentColor],
            heading: s[SETTING_KEYS.adminHeadingColor],
          }}
        />

        {/* Light or dark is chosen here, never taken from the operating
            system: a shop working in a lit room should not get a dark admin
            because someone's laptop happens to be set that way. */}
        <fieldset className="mt-7 border-0 p-0">
          <legend className="mb-2 text-sm font-medium text-slate-700">Admin appearance</legend>
          {isBr3thrTheme(s[SETTING_KEYS.storeTheme]) ? (
            <p className="mb-3 rounded-[var(--admin-radius-sm)] bg-[var(--admin-inset)] px-3.5 py-2.5 text-xs text-slate-600">
              While the storefront uses the Br3thr theme, the admin wears the same black and gold, and the colours above and this choice are not used.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2.5">
            {[
              { value: "light", label: "Light", hint: "Cool grey canvas, white cards" },
              { value: "dark", label: "Dark (Carbon)", hint: "Near-black canvas and panels" },
            ].map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-2.5 rounded-[var(--admin-radius-sm)] border border-[var(--admin-line-strong)] bg-[var(--admin-surface)] px-3.5 py-3 has-[:checked]:border-[var(--admin-accent)] has-[:checked]:bg-[var(--admin-accent)]/5"
              >
                <input
                  type="radio"
                  name="adminScheme"
                  value={opt.value}
                  defaultChecked={
                    (s[SETTING_KEYS.adminScheme] === "dark" ? "dark" : "light") === opt.value
                  }
                  className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-800">{opt.label}</span>
                  <span className="block text-xs text-slate-500">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </SectionCard>

      <SectionCard title="Storefront colours">
        <p className="mb-6 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
          These drive the shop itself &mdash; buttons, links, badges, the hero and
          the footer. The lighter tints, hover shades and deep panel colours are
          worked out from these three, so you only pick the three.
        </p>

        <ColourScheme
          swatches={STOREFRONT_SWATCHES}
          fields={[
            { key: "sidebar", name: "storefrontPrimary", label: "Primary (buttons, links)" },
            { key: "accent", name: "storefrontDark", label: "Deep panels (hero, banners)" },
            { key: "heading", name: "storefrontHighlight", label: "Highlight (buttons, badges)" },
          ]}
          initial={{
            sidebar: s[SETTING_KEYS.storefrontPrimary],
            accent: s[SETTING_KEYS.storefrontDark],
            heading: s[SETTING_KEYS.storefrontHighlight],
          }}
        />

        <div className="mt-7 max-w-md">
          <Field label="Storefront style" htmlFor="storefrontStyle">
            <select
              id="storefrontStyle"
              name="storefrontStyle"
              defaultValue={s[SETTING_KEYS.storefrontStyle] === "flat" ? "flat" : "holo"}
              className={fieldSelect}
            >
              <option value="holo">Holographic &mdash; logo gradients and animation</option>
              <option value="flat">Flat &mdash; plain colours, no animation</option>
            </select>
          </Field>
          <p className="mt-2 text-xs text-slate-500">
            Holographic turns buttons, sale badges and titles into the logo&rsquo;s
            rainbow foil, adds a glow to the dark panels and a lift to product
            cards. Visitors who ask their device for less motion get it without
            the movement.
          </p>
        </div>
      </SectionCard>

      <div className="flex justify-end pb-2">
        <button type="submit" className={`${btnPrimary} px-8`}>
          Save appearance
        </button>
      </div>
    </form>
  );
}
