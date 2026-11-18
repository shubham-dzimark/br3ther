import type { Metadata } from "next";
import { requireCapability } from "@/lib/permissions";
import { getAnnouncementConfig } from "@/lib/announcement";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { SectionCard, Field, fieldInput, fieldTextarea, fieldSelect } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { AnnouncementBar } from "@/components/admin/legacy/AnnouncementBar";
import { saveAnnouncement } from "./actions";
import { getTimeZone, toLocalInput } from "@/lib/timezone";

export const metadata: Metadata = { title: "Announcement bar" };
export const dynamic = "force-dynamic";

export default async function AnnouncementPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("content");
  const [{ saved }, config, s] = await Promise.all([
    searchParams,
    getAnnouncementConfig(),
    getSettings(),
  ]);

  // The stored value is an instant; the input wants the store's wall clock.
  const tz = await getTimeZone();
  const endsLocal = config.endsAt
    ? toLocalInput(new Date(config.endsAt), tz)
    : "";

  const preview =
    config.messages.length > 0
      ? config.messages
      : ["FLASH SALE — 25% OFF YOUR FIRST ORDER"];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Announcement bar
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          The strip above the header. Best used for one thing at a time — a
          sale, free shipping, a shipping cut-off.
        </p>
      </div>

      {saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved. {config.enabled ? "It's live on the storefront." : "Still switched off."}
        </p>
      ) : null}

      {/* Live preview, rendered with the real component so what is shown here
          cannot drift from what visitors get. */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/70">
        <p className="border-b border-slate-200/70 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Preview
        </p>
        <div
          style={
            {
              "--brand-highlight": s[SETTING_KEYS.storefrontHighlight] || "#B4802A",
              "--brand-surface": s[SETTING_KEYS.storefrontDark] || "#0F2E26",
              "--brand-darkest": s[SETTING_KEYS.storefrontDark] || "#0b1f1a",
            } as React.CSSProperties
          }
        >
          <AnnouncementBar
            messages={preview}
            eyebrow={config.eyebrow}
            coupon={config.coupon}
            linkUrl={config.linkUrl}
            linkLabel={config.linkLabel}
            style={config.style}
            bg={config.bg}
            fg={config.fg}
            endsAt={config.endsAt}
            dismissible={false}
            hideDays={0}
            rotateSeconds={config.rotateSeconds}
          />
        </div>
      </div>

      <form action={saveAnnouncement} className="space-y-5">
        <SectionCard title="Message">
          <label className="mb-7 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={config.enabled}
              className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
            />
            <span className="text-sm text-slate-700">
              Show the announcement bar
              <span className="mt-0.5 block text-xs text-slate-500">
                Stays hidden while there is no message to show, whatever this
                says — an empty coloured strip only steals space.
              </span>
            </span>
          </label>

          <Field label="Messages — one per line, up to 5" htmlFor="messages">
            <textarea
              id="messages"
              name="messages"
              rows={3}
              defaultValue={config.messages.join("\n")}
              placeholder={"FLASH SALE — 25% OFF WITH CODE NEWMEMBER25\nFREE SHIPPING ON ORDERS OVER $75"}
              className={fieldTextarea}
            />
          </Field>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            More than one line and the bar cycles through them. Two is usually
            the limit of what anyone reads — a bar that says four things says
            nothing.
          </p>

          <div className="mt-7 grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Small label before it (optional)" htmlFor="eyebrow">
              <input
                id="eyebrow"
                name="eyebrow"
                defaultValue={config.eyebrow}
                placeholder="Canada's #1 trusted store"
                className={fieldInput}
              />
            </Field>
            <Field label="Messages" htmlFor="layout">
              <select id="layout" name="layout" className={fieldSelect} defaultValue={config.layout}>
                <option value="strip">All side by side, with icons</option>
                <option value="rotate">One at a time, cycling</option>
              </select>
            </Field>
            <Field label="Cycle every (seconds)" htmlFor="rotateSeconds">
              <input
                id="rotateSeconds"
                name="rotateSeconds"
                type="number"
                min={3}
                max={60}
                defaultValue={config.rotateSeconds}
                className={fieldInput}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Coupon, link and countdown">
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-3">
            <Field label="Coupon code (optional)" htmlFor="coupon">
              <input
                id="coupon"
                name="coupon"
                defaultValue={config.coupon}
                placeholder="NEWMEMBER25"
                className={`${fieldInput} uppercase`}
              />
            </Field>
            <Field label="Button text (optional)" htmlFor="linkLabel">
              <input
                id="linkLabel"
                name="linkLabel"
                defaultValue={config.linkLabel}
                placeholder="Shop the sale"
                className={fieldInput}
              />
            </Field>
            <Field label="Button link" htmlFor="linkUrl">
              <input
                id="linkUrl"
                name="linkUrl"
                defaultValue={config.linkUrl}
                placeholder="/shop?sale=1"
                className={fieldInput}
              />
            </Field>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            The coupon shows as a button visitors click to copy — far more
            likely to be used than a code they have to remember on the way to
            checkout. The code must already exist under Coupons; this only
            displays it.
          </p>

          <div className="mt-7 grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Counts down to (optional)" htmlFor="endsAt">
              <input
                id="endsAt"
                name="endsAt"
                type="datetime-local"
                defaultValue={endsLocal}
                className={fieldInput}
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            A live timer appears while this is in the future, and disappears on
            its own when it passes — the bar keeps working without it.
          </p>
        </SectionCard>

        <SectionCard title="Look and behaviour">
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-3">
            <Field label="Colour" htmlFor="style">
              <select
                id="style"
                name="style"
                defaultValue={config.style}
                className={fieldSelect}
              >
                <option value="highlight">Brand highlight (recommended)</option>
                <option value="dark">Dark, matching the header</option>
                <option value="custom">Custom colours</option>
              </select>
            </Field>
            <Field label="Custom background (hex)" htmlFor="bg">
              <input id="bg" name="bg" defaultValue={config.bg} placeholder="#111827" className={fieldInput} />
            </Field>
            <Field label="Custom text (hex)" htmlFor="fg">
              <input id="fg" name="fg" defaultValue={config.fg} placeholder="#ffffff" className={fieldInput} />
            </Field>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            The highlight colour is the one that gets noticed: it is the only
            warm thing against the dark header, which is exactly why it works.
            Custom colours are only used when &ldquo;Custom&rdquo; is selected.
          </p>

          <div className="mt-7 space-y-3">
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input
                type="checkbox"
                name="sticky"
                defaultChecked={config.sticky}
                className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
              />
              <span className="text-sm text-slate-700">
                Keep it on screen while scrolling
                <span className="mt-0.5 block text-xs text-slate-500">
                  Travels with the header. Turn off to let it scroll away after
                  the first screen.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input
                type="checkbox"
                name="dismissible"
                defaultChecked={config.dismissible}
                className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
              />
              <span className="text-sm text-slate-700">
                Let visitors close it
                <span className="mt-0.5 block text-xs text-slate-500">
                  Worth leaving on. A bar someone cannot get rid of is the kind
                  of thing that gets a shop closed rather than read.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Stay closed for (days, 0 = until next visit)" htmlFor="hideDays">
              <input
                id="hideDays"
                name="hideDays"
                type="number"
                min={0}
                max={365}
                defaultValue={config.hideDays}
                className={fieldInput}
              />
            </Field>
          </div>
        </SectionCard>

        <div className="flex justify-end">
          <button type="submit" className={btnPrimary}>
            Save announcement bar
          </button>
        </div>
      </form>
    </div>
  );
}
