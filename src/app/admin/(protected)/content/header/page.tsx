import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { CATEGORY_ORDER } from "@/lib/category-order";
import { getNavigationForAdmin } from "@/lib/navigation";
import { defaultHeaderMenu } from "@/lib/header-menu";
import { makeTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import { SectionCard, Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { headerStyle } from "@/lib/chrome-style";
import { btnPrimary } from "@/components/admin/ui";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { NavEditor, type NavRow } from "@/components/admin/NavEditor";
import { MenuLinkList } from "@/components/admin/MenuLinkList";
import { Toggle, TextField } from "@/components/admin/SettingFields";
import { requireCapability } from "@/lib/permissions";
import { saveHeaderSettings } from "../../settings/actions";

export const metadata: Metadata = { title: "Header" };
export const dynamic = "force-dynamic";

export default async function HeaderControlPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapability("content");
  const [{ saved, error }, s, menu, categories] = await Promise.all([
    searchParams,
    getSettings(),
    getNavigationForAdmin("header"),
    // Same query as the header's own fallback, so the pre-fill matches it.
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: CATEGORY_ORDER,
      select: { name: true, slug: true },
      take: 6,
    }),
  ]);

  const t = makeTranslator(DEFAULT_LOCALE);

  /*
   * With no header menu saved, the editor starts from the menu the header is
   * drawing right now, so what is on screen is what gets edited. Saving
   * stores it as the header menu.
   */
  const usingDefaults = menu.length === 0;
  let n = 0;
  const rows: NavRow[] = usingDefaults
    ? defaultHeaderMenu(t, categories).flatMap((item) => [
        { id: `d${n++}`, label: item.label, url: item.url, depth: 0, isActive: true, newTab: false },
        ...item.children.map((c) => ({
          id: `d${n++}`,
          label: c.label,
          url: c.url,
          depth: 1,
          isActive: true,
          newTab: false,
        })),
      ])
    : menu.map((i) => ({
        id: i.id,
        label: i.label,
        url: i.url,
        depth: i.parentId ? 1 : 0,
        isActive: i.isActive,
        newTab: i.newTab,
      }));

  const v = (key: keyof typeof SETTING_KEYS) => s[SETTING_KEYS[key]] ?? "";
  const on = (key: keyof typeof SETTING_KEYS) => s[SETTING_KEYS[key]] !== "0";
  const announceOn = s[SETTING_KEYS.announceEnabled] === "1";

  return (
    <form action={saveHeaderSettings} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Header</h1>
          {saved ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              Saved
            </span>
          ) : null}
        </div>
        <Link
          href="/"
          target="_blank"
          className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)]"
        >
          View storefront
        </Link>
      </div>
      <p className="-mt-2 text-sm text-slate-500">
        Everything in the storefront header: the logo, the menu, the icons on the right and
        the phone menu. Leave a text field blank to use the built-in wording shown in grey.
      </p>
      {error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          The menu couldn&rsquo;t be read. Nothing was changed.
        </p>
      ) : null}

      <SectionCard title="Header style">
        <div className="max-w-md">
          <Field label="Which header the shop shows" htmlFor="headerStyle">
            <select id="headerStyle" name="headerStyle" className={fieldSelect} defaultValue={headerStyle(v("headerStyle"))}>
              <option value="full">Full &mdash; announcement bar, menu and icons</option>
              <option value="simple">Simple &mdash; menu icon, centred logo, search, account and cart</option>
            </select>
          </Field>
          <p className="mt-2 px-1 text-xs text-slate-400">
            Simple hides the announcement bar and puts the menu below behind the menu icon.
          </p>
        </div>
      </SectionCard>

      {/* ---------- 1. Logo ---------- */}
      <SectionCard title="Logo">
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <div className="md:col-span-2">
            <MediaPicker
              name="logoUrl"
              label="Store logo"
              defaultValue={v("logoUrl")}
              hint="A transparent PNG works best. The same logo is used at the top of your emails."
            />
          </div>
          <Field
            label="Header shows"
            htmlFor="storeBrandMode"
            hint="With no logo uploaded the store name is always shown, so the header can never come out blank."
          >
            <select
              id="storeBrandMode"
              name="storeBrandMode"
              defaultValue={v("storeBrandMode") || "both"}
              className={fieldInput}
            >
              <option value="both">Logo and store name</option>
              <option value="image">Logo only</option>
              <option value="text">Store name only</option>
            </select>
          </Field>
          <Field
            label="Logo width (px)"
            htmlFor="storeLogoWidth"
            hint="Blank for the default size. When the header pins on scroll the logo shrinks to 60px at most."
          >
            <input
              id="storeLogoWidth"
              name="storeLogoWidth"
              type="number"
              min={16}
              max={400}
              placeholder="auto"
              defaultValue={v("storeLogoWidth")}
              className={fieldInput}
            />
          </Field>
        </div>
        <p className="mt-5 px-1 text-xs text-slate-500">
          The store name itself is set in{" "}
          <Link href="/admin/settings" className="font-medium text-[var(--admin-accent)] hover:underline">
            general settings
          </Link>
          .
        </p>
      </SectionCard>

      {/* ---------- 2. Menu ---------- */}
      {/* The editor and the links it can point at, side by side. */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionCard title="Menu">
          <p className="mb-5 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Top-level items sit across the header. Nest an item under another and it shows in a
            dropdown on desktop and as a sub-list in the phone menu.
            {usingDefaults ? (
              <>
                {" "}
                <span className="font-medium text-amber-700">
                  This is the built-in menu the header is showing now
                </span>{" "}
                &mdash; edit it and save to make it your own. Until then, new categories are added
                under Shop automatically.
              </>
            ) : null}
          </p>
          <NavEditor initial={rows} menu="header" />
        </SectionCard>
        <MenuLinkList />
      </div>

      {/* ---------- 3. Icons & behaviour ---------- */}
      <SectionCard title="Icons & behaviour">
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
          <Toggle name="headerSearchEnabled" checked={on("headerSearchEnabled")} title="Search icon" hint="Opens the product search." />
          <Toggle name="headerWishlistEnabled" checked={on("headerWishlistEnabled")} title="Wishlist icon" hint="Hidden on phones either way, to save room." />
          <Toggle name="headerAccountEnabled" checked={on("headerAccountEnabled")} title="Account icon" hint="Sign in, or the account page once signed in." />
          <Toggle name="headerSticky" checked={on("headerSticky")} title="Pin the header on scroll" hint="Off, the header scrolls away with the page." />
        </div>
        <p className="mt-4 px-1 text-xs text-slate-500">The cart icon is always shown.</p>
      </SectionCard>

      {/* ---------- 4. Phone menu ---------- */}
      <SectionCard title="Phone menu button">
        <div className="mb-7">
          <Toggle
            name="headerDrawerButtonEnabled"
            checked={on("headerDrawerButtonEnabled")}
            title="Show the button at the bottom of the phone menu"
            hint="The highlighted pill under the menu links."
          />
        </div>
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <TextField name="headerDrawerButtonLabel" label="Button label" value={v("headerDrawerButtonLabel")} placeholder={t("nav.onSale")} />
          <TextField name="headerDrawerButtonUrl" label="Button link" value={v("headerDrawerButtonUrl")} placeholder="/shop?sale=1" />
        </div>
      </SectionCard>

      {/* ---------- 5. Announcement bar ---------- */}
      <SectionCard title="Announcement bar">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            The strip above the header is{" "}
            <span className={announceOn ? "font-medium text-emerald-700" : "font-medium text-slate-500"}>
              {announceOn ? "on" : "off"}
            </span>
            . Its messages, coupon, colours and countdown have their own page.
          </p>
          <Link
            href="/admin/content/announcement"
            className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[var(--admin-accent)]"
          >
            Edit announcement bar
          </Link>
        </div>
      </SectionCard>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <button type="submit" className={`${btnPrimary} shadow-lg`}>
          Save header
        </button>
      </div>
    </form>
  );
}
