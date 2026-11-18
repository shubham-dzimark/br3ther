import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { SectionCard, Field, fieldSelect, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { savePromoPopupSettings } from "../../settings/actions";
import { requireCapability } from "@/lib/permissions";

export const metadata: Metadata = { title: "Promo popup" };
export const dynamic = "force-dynamic";

export default async function PromoPopupPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("content");

  const [{ saved }, s, coupons, signupCount] = await Promise.all([
    searchParams,
    getSettings(),
    prisma.coupon.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { code: true, type: true, value: true, minSubtotalCents: true },
    }),
    prisma.newsletterSubscriber.count(),
  ]);

  const enabled = s[SETTING_KEYS.promoPopupEnabled] === "1";
  const chosen = (s[SETTING_KEYS.promoPopupCoupon] ?? "").toUpperCase();
  // A code that no longer exists would be advertised and then rejected at
  // checkout, so surface that here rather than letting customers find it.
  const chosenMissing = chosen !== "" && !coupons.some((c) => c.code === chosen);

  return (
    <div className="space-y-5">
      <form action={savePromoPopupSettings} className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Promo popup
          </h1>
          {saved ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              Saved
            </span>
          ) : null}
          <span className="ml-auto text-sm text-slate-500">
            {signupCount} signup{signupCount === 1 ? "" : "s"} collected
          </span>
        </div>

        <SectionCard title="Popup">
          <label className="mb-7 flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="promoPopupEnabled"
              defaultChecked={enabled}
              className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
            />
            Show the promo popup to storefront visitors
          </label>

          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Eyebrow (small line above the heading)" htmlFor="promoPopupEyebrow">
              <input
                id="promoPopupEyebrow"
                name="promoPopupEyebrow"
                defaultValue={s[SETTING_KEYS.promoPopupEyebrow]}
                placeholder="One code per email — leave blank to hide"
                className={fieldInput}
              />
            </Field>
            <Field label="Heading" htmlFor="promoPopupTitle">
              <input
                id="promoPopupTitle"
                name="promoPopupTitle"
                defaultValue={s[SETTING_KEYS.promoPopupTitle]}
                placeholder="UNLOCK YOUR WELCOME"
                className={fieldInput}
              />
            </Field>
            <Field label="Highlighted word" htmlFor="promoPopupHighlight">
              <input
                id="promoPopupHighlight"
                name="promoPopupHighlight"
                defaultValue={s[SETTING_KEYS.promoPopupHighlight]}
                placeholder="GIFT"
                className={fieldInput}
              />
            </Field>
          </div>

          <div className="mt-7">
            <Field label="Body text" htmlFor="promoPopupBody">
              <textarea
                id="promoPopupBody"
                name="promoPopupBody"
                rows={3}
                defaultValue={s[SETTING_KEYS.promoPopupBody]}
                placeholder="Join our list and unlock your first-order offer."
                className={fieldTextarea}
              />
            </Field>
          </div>

          <div className="mt-7">
            <MediaPicker
              name="promoPopupImage"
              label="Offer image"
              defaultValue={s[SETTING_KEYS.promoPopupImage]}
              hint="Fills the left half of the popup. A tall image works best — around 800 × 1000. Put the offer itself on the artwork, like the reference."
            />
          </div>

          <div className="mt-7 grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Button label" htmlFor="promoPopupButton">
              <input
                id="promoPopupButton"
                name="promoPopupButton"
                defaultValue={s[SETTING_KEYS.promoPopupButton]}
                placeholder="Choose my gift"
                className={fieldInput}
              />
            </Field>
            <Field label="Dismiss link" htmlFor="promoPopupDismiss">
              <input
                id="promoPopupDismiss"
                name="promoPopupDismiss"
                defaultValue={s[SETTING_KEYS.promoPopupDismiss]}
                placeholder="No thanks"
                className={fieldInput}
              />
            </Field>
          </div>

          <div className="mt-7">
            <Field label="Message after signing up" htmlFor="promoPopupSuccess">
              <input
                id="promoPopupSuccess"
                name="promoPopupSuccess"
                defaultValue={s[SETTING_KEYS.promoPopupSuccess]}
                className={fieldInput}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="The offer">
          <Field label="Discount code to hand out" htmlFor="promoPopupCoupon">
            <select
              id="promoPopupCoupon"
              name="promoPopupCoupon"
              defaultValue={chosen}
              className={fieldInput}
            >
              <option value="">No code — collect emails only</option>
              {coupons.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} —{" "}
                  {c.type === "PERCENT"
                    ? `${c.value}% off`
                    : `$${(c.value / 100).toFixed(2)} off`}
                  {c.minSubtotalCents > 0
                    ? ` over $${(c.minSubtotalCents / 100).toFixed(2)}`
                    : ""}
                </option>
              ))}
              {chosenMissing ? <option value={chosen}>{chosen} (missing)</option> : null}
            </select>
          </Field>

          {chosenMissing ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <strong>{chosen}</strong> isn&rsquo;t an active coupon any more. The popup
              won&rsquo;t show a code until you pick one that exists &mdash; better than
              handing out a code the checkout would reject.
            </p>
          ) : null}

          <p className="mt-3 text-xs text-slate-500">
            Create codes under Promotions &rarr; Coupons. Set the free-shipping
            threshold on the coupon itself (for example &ldquo;$30 off over
            $100&rdquo;) so the popup and the checkout can never disagree.
          </p>

          <div className="mt-7 grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="How often to show it" htmlFor="promoPopupFrequency">
              <select
                id="promoPopupFrequency"
                name="promoPopupFrequency"
                defaultValue={s[SETTING_KEYS.promoPopupFrequency] || "days"}
                className={fieldSelect}
              >
                <option value="days">Every so often — hide for the days set below</option>
                <option value="session">Once per visit — returns on their next visit</option>
                <option value="once">Once only — never shown to them again</option>
                <option value="always">Every page load — for previewing</option>
              </select>
            </Field>
            <Field label="Show after (seconds)" htmlFor="promoPopupDelaySeconds">
              <input
                id="promoPopupDelaySeconds"
                name="promoPopupDelaySeconds"
                type="number"
                min="0"
                max="60"
                defaultValue={s[SETTING_KEYS.promoPopupDelaySeconds]}
                className={fieldInput}
              />
            </Field>
            <Field label="Hide again for (days)" htmlFor="promoPopupHideDays">
              <input
                id="promoPopupHideDays"
                name="promoPopupHideDays"
                type="number"
                min="1"
                max="365"
                defaultValue={s[SETTING_KEYS.promoPopupHideDays]}
                className={fieldInput}
              />
            </Field>
          </div>

          <div className="mt-7 space-y-3.5 rounded-2xl bg-slate-50 px-4 py-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="promoPopupHideAfterClaim"
                defaultChecked={s[SETTING_KEYS.promoPopupHideAfterClaim] !== "0"}
                className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
              />
              <span className="text-sm text-slate-700">
                Stop showing it once they claim the offer
                <span className="mt-0.5 block text-xs text-slate-500">
                  Overrides the frequency above &mdash; someone who already has the
                  code is never asked for it again.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="promoPopupShowClose"
                defaultChecked={s[SETTING_KEYS.promoPopupShowClose] !== "0"}
                className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
              />
              <span className="text-sm text-slate-700">
                Show the &times; close button
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="promoPopupShowDismiss"
                defaultChecked={s[SETTING_KEYS.promoPopupShowDismiss] !== "0"}
                className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
              />
              <span className="text-sm text-slate-700">
                Show the &ldquo;{s[SETTING_KEYS.promoPopupDismiss] || "No thanks"}&rdquo; link
                <span className="mt-0.5 block text-xs text-slate-500">
                  With both of these off, the popup still closes on Escape or by
                  clicking outside it &mdash; a modal with no way out traps
                  keyboard and screen-reader users.
                </span>
              </span>
            </label>
          </div>

          <p className="mt-4 text-xs text-slate-400">
            Firing immediately hurts conversion. Once a visitor signs up or dismisses
            it, they won&rsquo;t see it again for the number of days above.
          </p>
        </SectionCard>

        <SectionCard title="Recent purchase notice">
          <label className="mb-7 flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="salesPopEnabled"
              defaultChecked={s[SETTING_KEYS.salesPopEnabled] === "1"}
              className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
            />
            Show a &ldquo;someone just bought this&rdquo; notice, bottom-left
          </label>

          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Show every (seconds)" htmlFor="salesPopIntervalSeconds">
              <input
                id="salesPopIntervalSeconds"
                name="salesPopIntervalSeconds"
                type="number"
                min="8"
                max="300"
                defaultValue={s[SETTING_KEYS.salesPopIntervalSeconds]}
                className={fieldInput}
              />
            </Field>
            <Field label="Stay on screen for (seconds)" htmlFor="salesPopDurationSeconds">
              <input
                id="salesPopDurationSeconds"
                name="salesPopDurationSeconds"
                type="number"
                min="2"
                max="60"
                defaultValue={s[SETTING_KEYS.salesPopDurationSeconds]}
                className={fieldInput}
              />
            </Field>
          </div>

          <div className="mt-7">
            <Field label="Notices to show" htmlFor="salesPopFallback">
              <textarea
                id="salesPopFallback"
                name="salesPopFallback"
                rows={5}
                defaultValue={s[SETTING_KEYS.salesPopFallback]}
                placeholder="Amelia|Toronto, ON|Cohiba Siglo VI|12 minutes ago"
                className={fieldTextarea}
              />
            </Field>
          </div>

          <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            One per line: <code>Name|City|Product|How long ago</code>. Only these
            lines are shown, never your real orders, and they rotate in this order.
            Type a product exactly as it is named in the shop and the notice shows
            its photo and links to it.
          </p>
        </SectionCard>

        <SectionCard title="Floating contact button">
          <label className="mb-7 flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="contactFabEnabled"
              defaultChecked={s[SETTING_KEYS.contactFabEnabled] === "1"}
              className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
            />
            Show a floating contact button, bottom-right
          </label>

          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Button label" htmlFor="contactFabLabel">
              <input
                id="contactFabLabel"
                name="contactFabLabel"
                defaultValue={s[SETTING_KEYS.contactFabLabel]}
                placeholder="Contact us"
                className={fieldInput}
              />
            </Field>
            <Field label="Email" htmlFor="contactFabEmail">
              <input
                id="contactFabEmail"
                name="contactFabEmail"
                type="email"
                defaultValue={s[SETTING_KEYS.contactFabEmail]}
                placeholder="help@example.com"
                className={fieldInput}
              />
            </Field>
            <Field label="Phone" htmlFor="contactFabPhone">
              <input
                id="contactFabPhone"
                name="contactFabPhone"
                defaultValue={s[SETTING_KEYS.contactFabPhone]}
                placeholder="+1 604 555 0100"
                className={fieldInput}
              />
            </Field>
            <Field label="WhatsApp number" htmlFor="contactFabWhatsapp">
              <input
                id="contactFabWhatsapp"
                name="contactFabWhatsapp"
                defaultValue={s[SETTING_KEYS.contactFabWhatsapp]}
                placeholder="16045550100"
                className={fieldInput}
              />
            </Field>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Only the channels you fill in appear &mdash; leave one blank and it is
            hidden rather than offered as a dead link.
          </p>
        </SectionCard>

        <div className="flex justify-end pb-2">
          <button type="submit" className={`${btnPrimary} px-8`}>
            Save
          </button>
        </div>
  
      <SectionCard title="Checkout exit prompt">
        <p className="mb-7 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
          Shown once per visit when someone on the checkout page moves the
          pointer up toward the tab bar or the close button.
          <span className="mt-1 block">
            A browser cannot show custom content when a tab is actually closed
            &mdash; only this &ldquo;about to leave&rdquo; moment can be caught,
            and only with a mouse. It never fires on touch devices.
          </span>
        </p>

        <label className="mb-7 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
          <input
            type="checkbox"
            name="checkoutExitEnabled"
            defaultChecked={s[SETTING_KEYS.checkoutExitEnabled] === "1"}
            className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
          />
          <span className="text-sm text-slate-700">
            Show the prompt on checkout
            <span className="mt-0.5 block text-xs text-slate-500">
              Off by default. The customer&rsquo;s order total and the points
              they will earn are filled in automatically.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label="Heading" htmlFor="checkoutExitTitle">
            <input
              id="checkoutExitTitle"
              name="checkoutExitTitle"
              defaultValue={s[SETTING_KEYS.checkoutExitTitle]}
              className={fieldInput}
            />
          </Field>
          <Field label="Button label" htmlFor="checkoutExitButton">
            <input
              id="checkoutExitButton"
              name="checkoutExitButton"
              defaultValue={s[SETTING_KEYS.checkoutExitButton]}
              placeholder="Finish my order"
              className={fieldInput}
            />
          </Field>
          <Field label="Discount code to show (optional)" htmlFor="checkoutExitCoupon">
            <input
              id="checkoutExitCoupon"
              name="checkoutExitCoupon"
              defaultValue={s[SETTING_KEYS.checkoutExitCoupon]}
              placeholder="Leave blank to offer no code"
              className={fieldInput}
            />
          </Field>
        </div>

        <div className="mt-7">
          <Field label="Body" htmlFor="checkoutExitBody">
            <textarea
              id="checkoutExitBody"
              name="checkoutExitBody"
              rows={3}
              defaultValue={s[SETTING_KEYS.checkoutExitBody]}
              className={fieldTextarea}
            />
          </Field>
        </div>
      </SectionCard>

    </form>
    </div>
  );
}
