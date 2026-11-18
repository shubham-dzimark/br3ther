import type { Metadata } from "next";
import { requireCapability } from "@/lib/permissions";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getAgeGateConfig } from "@/lib/age-gate";
import { SectionCard, Field, fieldInput, fieldSelect, fieldTextarea } from "@/components/admin/Field";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { btnPrimary } from "@/components/admin/ui";
import { saveAgeGate } from "./actions";

export const metadata: Metadata = { title: "Age verification" };
export const dynamic = "force-dynamic";

export default async function AgeVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("content");
  const [{ saved }, s, config] = await Promise.all([
    searchParams,
    getSettings(),
    getAgeGateConfig(),
  ]);

  return (
    <form action={saveAgeGate} className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Age verification
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>
      <p className="-mt-2 text-sm text-slate-500">
        A gate shown before anyone can see the shop.
      </p>

      <div
        className={`rounded-2xl border px-4 py-3.5 text-sm ${
          config.enabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        {config.enabled ? (
          <>
            <strong className="font-semibold">The gate is live.</strong> Visitors
            must confirm they are {config.minAge} or older before the storefront
            renders.
          </>
        ) : (
          <>
            <strong className="font-semibold">The gate is off.</strong> Nobody
            is asked anything.
          </>
        )}
      </div>

      <SectionCard title="The gate">
        <label className="mb-7 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={config.enabled}
            className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
          />
          <span className="text-sm text-slate-700">
            Ask visitors to confirm their age
            <span className="mt-0.5 block text-xs text-slate-500">
              Decided on the server, so the shop is never visible behind it even
              for a moment.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-3">
          <Field label="Minimum age" htmlFor="minAge">
            <input
              id="minAge"
              name="minAge"
              type="number"
              min="1"
              max="99"
              defaultValue={config.minAge}
              className={fieldInput}
            />
          </Field>
          <Field label="How to ask" htmlFor="mode">
            <select id="mode" name="mode" defaultValue={config.mode} className={fieldSelect}>
              <option value="confirm">Yes / no buttons</option>
              <option value="dob">Enter date of birth</option>
            </select>
          </Field>
          <Field label="Remember for (days)" htmlFor="rememberDays">
            <input
              id="rememberDays"
              name="rememberDays"
              type="number"
              min="0"
              max="365"
              defaultValue={config.rememberDays}
              className={fieldInput}
            />
          </Field>
        </div>

        <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-500">
          Date of birth is checked on the server, not in the browser, so it
          can&rsquo;t be clicked past. The date itself is never stored &mdash;
          only the fact that the age was cleared. <strong>0 days</strong> asks
          again every session. Raising the minimum age later re-asks everyone
          who only cleared the old one.
        </p>
      </SectionCard>

      <SectionCard title="What it says">
        <div className="space-y-7">
          <Field label="Heading" htmlFor="title">
            <input
              id="title"
              name="title"
              defaultValue={s[SETTING_KEYS.ageGateTitle]}
              className={fieldInput}
            />
          </Field>
          <Field label="Message" htmlFor="body">
            <textarea
              id="body"
              name="body"
              rows={2}
              defaultValue={s[SETTING_KEYS.ageGateBody]}
              className={fieldTextarea}
            />
          </Field>

          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Confirm button" htmlFor="confirmLabel">
              <input
                id="confirmLabel"
                name="confirmLabel"
                defaultValue={s[SETTING_KEYS.ageGateConfirmLabel]}
                className={fieldInput}
              />
            </Field>
            <Field label="Decline button" htmlFor="declineLabel">
              <input
                id="declineLabel"
                name="declineLabel"
                defaultValue={s[SETTING_KEYS.ageGateDeclineLabel]}
                className={fieldInput}
              />
            </Field>
          </div>

          <Field label="Footnote (optional)" htmlFor="footnote">
            <input
              id="footnote"
              name="footnote"
              placeholder="By entering you agree to our terms."
              defaultValue={s[SETTING_KEYS.ageGateFootnote]}
              className={fieldInput}
            />
          </Field>
        </div>

        <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3.5 text-xs text-slate-500">
          Write <code className="rounded bg-white px-1">{"{age}"}</code> anywhere
          and it is replaced with the minimum age, so changing the number above
          updates every line at once.
        </p>
      </SectionCard>

      <SectionCard title="If they say no">
        <div className="space-y-7">
          <Field label="Message shown" htmlFor="declineMessage">
            <textarea
              id="declineMessage"
              name="declineMessage"
              rows={2}
              defaultValue={s[SETTING_KEYS.ageGateDeclineMessage]}
              className={fieldTextarea}
            />
          </Field>
          <Field label="Or send them to (optional)" htmlFor="declineUrl">
            <input
              id="declineUrl"
              name="declineUrl"
              placeholder="https://www.google.com"
              defaultValue={s[SETTING_KEYS.ageGateDeclineUrl]}
              className={fieldInput}
            />
          </Field>
        </div>
        <p className="mt-4 px-1 text-xs text-slate-500">
          Declining is remembered for an hour only, and the gate offers a way
          back &mdash; a mis-tap shouldn&rsquo;t lock someone out of the shop
          for a month.
        </p>
      </SectionCard>

      <SectionCard title="Image">
        <MediaPicker
          name="image"
          label="Header image"
          defaultValue={s[SETTING_KEYS.ageGateImage]}
          hint="Optional, shown across the top of the gate. Landscape works best."
        />
        <div className="mt-7 flex justify-end">
          <button type="submit" className={btnPrimary}>Save</button>
        </div>
      </SectionCard>
    </form>
  );
}
