import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { CATEGORY_ORDER } from "@/lib/category-order";
import { getNavigationForAdmin } from "@/lib/navigation";
import { defaultFooterColumns } from "@/lib/footer-columns";
import { makeTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import { SectionCard, Field, fieldSelect } from "@/components/admin/Field";
import { footerStyle } from "@/lib/chrome-style";
import { btnPrimary } from "@/components/admin/ui";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { NavEditor, type NavRow } from "@/components/admin/NavEditor";
import { MenuLinkList } from "@/components/admin/MenuLinkList";
import { Toggle, TextField } from "@/components/admin/SettingFields";
import { requireCapability } from "@/lib/permissions";
import { saveFooterSettings } from "../../settings/actions";

export const metadata: Metadata = { title: "Footer" };
export const dynamic = "force-dynamic";

export default async function FooterControlPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapability("content");
  const [{ saved, error }, s, menu, pages, categories] = await Promise.all([
    searchParams,
    getSettings(),
    getNavigationForAdmin("footer"),
    prisma.contentPage.findMany({
      where: { isPublished: true },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, title: true },
    }),
    prisma.category.findMany({ orderBy: CATEGORY_ORDER, select: { slug: true, name: true }, take: 4 }),
  ]);

  // The built-in English wording, shown as placeholders so a blank field
  // visibly means "use this".
  const t = makeTranslator(DEFAULT_LOCALE);

  /*
   * With no footer menu saved, the editor starts from the columns the footer
   * is drawing right now, so what is on screen is what gets edited. Saving
   * stores them as the footer menu.
   */
  const usingDefaults = menu.length === 0;
  let n = 0;
  const rows: NavRow[] = usingDefaults
    ? defaultFooterColumns(t, pages, categories).flatMap((col) => [
        { id: `d${n++}`, label: col.label, url: col.links[0]?.url ?? "/", depth: 0, isActive: true, newTab: false },
        ...col.links.map((l) => ({
          id: `d${n++}`,
          label: l.label,
          url: l.url,
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

  return (
    <form action={saveFooterSettings} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Footer</h1>
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
        Everything in the storefront footer, top to bottom. Leave a text field blank to use
        the built-in wording shown in grey, which is translated into French automatically
        &mdash; anything you type is translated too.
      </p>
      {error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          The link columns couldn&rsquo;t be read. Nothing was changed.
        </p>
      ) : null}

      {/* ---------- 1. Contact column ---------- */}
      <SectionCard title="Footer style">
        <div className="max-w-md">
          <Field label="Which footer the shop shows" htmlFor="footerStyle">
            <select id="footerStyle" name="footerStyle" className={fieldSelect} defaultValue={footerStyle(v("footerStyle"))}>
              <option value="full">Full &mdash; columns, newsletter and wordmark</option>
              <option value="copyright">Copyright only &mdash; one line</option>
            </select>
          </Field>
          <p className="mt-2 px-1 text-xs text-slate-400">
            Copyright only shows the copyright line from &ldquo;Wordmark &amp; bottom bar&rdquo; below
            (&ldquo;{"{year}"}&rdquo; becomes the current year), or the built-in one if that is empty.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Contact column">
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <TextField name="footerContactHeading" label="Heading" value={v("footerContactHeading")} placeholder={t("footer.contactUs")} />
          <TextField name="footerContactLabel" label="Label above the email" value={v("footerContactLabel")} placeholder={t("footer.supportCentre")} />
          <TextField
            name="contactEmail"
            type="email"
            label="Email"
            value={v("contactEmail")}
            placeholder={v("contactFabEmail") || "support@example.com"}
            hint={v("contactFabEmail") ? "Blank uses the contact widget's address shown in grey." : undefined}
          />
          <TextField name="contactFabWhatsapp" label="WhatsApp number" value={v("contactFabWhatsapp")} placeholder="Hidden when blank" />
          <div className="md:col-span-2">
            <Field label="Address" htmlFor="storeAddress" hint="Hidden when blank. Line breaks are kept.">
              <textarea
                id="storeAddress"
                name="storeAddress"
                rows={3}
                defaultValue={v("storeAddress")}
                className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15"
              />
            </Field>
          </div>
        </div>
        <p className="mt-3 px-1 text-xs text-slate-500">
          Email, address and WhatsApp are the same values used in general settings and the
          contact widget &mdash; changing them here changes them there.
        </p>

        <div className="mt-7 grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Toggle name="footerLiveChatEnabled" checked={on("footerLiveChatEnabled")} title="Show the Live chat link" hint="Opens the chat panel." />
          <TextField name="footerLiveChatLabel" label="Live chat label" value={v("footerLiveChatLabel")} placeholder={t("footer.liveChat")} />
          <TextField name="footerContactLinkLabel" label="Contact link label" value={v("footerContactLinkLabel")} placeholder={t("footer.contactUs")} />
          <TextField name="footerContactLinkUrl" label="Contact link URL" value={v("footerContactLinkUrl")} placeholder="/contact" />
          <div className="md:col-span-2">
            <Toggle name="footerLanguageEnabled" checked={on("footerLanguageEnabled")} title="Show the English / Français switch" />
          </div>
        </div>
      </SectionCard>

      {/* ---------- 2. Link columns ---------- */}
      {/* The editor and the links it can point at, side by side. */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionCard title="Link columns">
          <p className="mb-5 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Each top-level item is a column heading and the items nested under it are its
            links. The first three top-level items are shown.
            {usingDefaults ? (
              <>
                {" "}
                <span className="font-medium text-amber-700">
                  These are the built-in columns the footer is showing now
                </span>{" "}
                &mdash; edit them and save to make them your own. Until then, new pages and
                categories are added automatically.
              </>
            ) : null}
          </p>
          <NavEditor initial={rows} menu="footer" />
        </SectionCard>
        <MenuLinkList />
      </div>

      {/* ---------- 3. Newsletter ---------- */}
      <SectionCard title="Newsletter">
        <div className="mb-7">
          <Toggle
            name="footerNewsletterEnabled"
            checked={on("footerNewsletterEnabled")}
            title="Show the signup column"
            hint="Addresses land in the subscriber list tagged “footer” and get the same welcome code as the popup."
          />
        </div>
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <TextField name="footerNewsletterTitle" label="Heading" value={v("footerNewsletterTitle")} placeholder={t("footer.newsletter")} />
          <TextField
            name="footerNewsletterSubtitle"
            label="Text under the heading"
            value={v("footerNewsletterSubtitle")}
            placeholder={v("promoPopupBody") || t("footer.subscribeSub")}
          />
          <TextField name="footerNewsletterPlaceholder" label="Email box placeholder" value={v("footerNewsletterPlaceholder")} placeholder={t("footer.emailPlaceholder")} />
          <TextField
            name="footerNewsletterButton"
            label="Button label"
            value={v("footerNewsletterButton")}
            placeholder={t("footer.submit")}
            hint="Read out by screen readers and shown on hover - the button itself is an arrow."
          />
          <div className="md:col-span-2">
            <TextField
              name="footerLegalIntro"
              label="Legal line"
              value={v("footerLegalIntro")}
              placeholder={t("footer.legalIntro")}
              hint="Followed by the Terms and Privacy links below."
            />
          </div>
          <TextField
            name="footerTermsUrl"
            label="Terms of Service link"
            value={v("footerTermsUrl")}
            placeholder="Auto: your terms page"
          />
          <TextField
            name="footerPrivacyUrl"
            label="Privacy Policy link"
            value={v("footerPrivacyUrl")}
            placeholder="Auto: your privacy page"
          />
        </div>
      </SectionCard>

      {/* ---------- 4. Wordmark & bottom bar ---------- */}
      <SectionCard title="Wordmark & bottom bar">
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Toggle name="footerWordmarkEnabled" checked={on("footerWordmarkEnabled")} title="Show the large wordmark" hint="The big faded name above the bottom bar." />
          <TextField name="footerWordmarkText" label="Wordmark text" value={v("footerWordmarkText")} placeholder={v("storeName") || "Store name"} />
          <div className="md:col-span-2">
            <TextField
              name="footerCopyright"
              label="Copyright line"
              value={v("footerCopyright")}
              placeholder={`© {year} ${v("storeName") || "Br3thr"}. ${t("footer.rights")}`}
              hint="Write {year} to insert the current year."
            />
          </div>
          <MediaPicker
            name="footerPaymentLogo"
            label="Payment logo"
            defaultValue={v("footerPaymentLogo")}
            hint="About 44px tall, on a transparent background that reads on dark."
          />
          <MediaPicker
            name="footerShippingLogo"
            label="Shipping logo"
            defaultValue={v("footerShippingLogo")}
            hint="Canada Post by default, about 32px tall. Clear it to hide."
          />
          <div className="md:col-span-2">
            <TextField
              name="footerAcceptText"
              label="Text when there is no payment logo"
              value={v("footerAcceptText")}
              placeholder={t("footer.weAccept")}
              hint="Also used as the payment logo's alt text."
            />
          </div>
        </div>
      </SectionCard>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <button type="submit" className={`${btnPrimary} shadow-lg`}>
          Save footer
        </button>
      </div>
    </form>
  );
}
