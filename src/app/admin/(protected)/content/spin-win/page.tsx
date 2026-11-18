import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { SectionCard, Field, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { requireCapability } from "@/lib/permissions";
import { saveSpinSettings, saveSpinPrize, deleteSpinPrize } from "./actions";

export const metadata: Metadata = { title: "Spin & Win" };
export const dynamic = "force-dynamic";

export default async function SpinWinPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; edit?: string }>;
}) {
  await requireCapability("settings");
  const [{ saved, edit }, s, prizes, coupons] = await Promise.all([
    searchParams,
    getSettings(),
    prisma.spinPrize.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.coupon.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { code: true, type: true, value: true },
      take: 200,
    }),
  ]);

  const editing = prizes.find((p) => p.id === edit) ?? null;
  const live = prizes.filter((p) => p.isActive && p.weight > 0);
  const total = live.reduce((n, p) => n + p.weight, 0);
  const known = new Set(coupons.map((c) => c.code));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Spin &amp; Win</h1>
          <p className="mt-1 text-sm text-slate-500">
            A prize wheel that opens over the shop. Each segment hands out one of
            your existing coupons.
          </p>
        </div>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      {s[SETTING_KEYS.spinEnabled] === "1" && live.length < 2 ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>The wheel is on but has fewer than two prizes.</strong> It will
          not be shown to anyone until at least two are active with a chance above
          zero.
        </p>
      ) : null}

      <form action={saveSpinSettings} className="space-y-5">
        <SectionCard title="The popup">
          <label className="mb-5 flex w-fit cursor-pointer items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              name="spinEnabled"
              defaultChecked={s[SETTING_KEYS.spinEnabled] === "1"}
              className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
            />
            Show Spin &amp; Win on the storefront
          </label>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Small line above the heading" htmlFor="spinEyebrow">
              <input id="spinEyebrow" name="spinEyebrow" className={fieldInput} defaultValue={s[SETTING_KEYS.spinEyebrow]} />
            </Field>
            <Field label="Heading" htmlFor="spinTitle">
              <input id="spinTitle" name="spinTitle" className={fieldInput} defaultValue={s[SETTING_KEYS.spinTitle]} />
            </Field>
            <Field label="Line under the heading" htmlFor="spinSubtitle">
              <textarea id="spinSubtitle" name="spinSubtitle" rows={2} className={fieldTextarea} defaultValue={s[SETTING_KEYS.spinSubtitle]} />
            </Field>
            <Field label="Small print" htmlFor="spinFineprint">
              <textarea id="spinFineprint" name="spinFineprint" rows={2} className={fieldTextarea} defaultValue={s[SETTING_KEYS.spinFineprint]} />
            </Field>
            <Field label="Show after (seconds)" htmlFor="spinDelaySeconds">
              <input id="spinDelaySeconds" name="spinDelaySeconds" type="number" min={0} max={120} className={fieldInput} defaultValue={s[SETTING_KEYS.spinDelaySeconds]} />
            </Field>
            <Field label="Show again after (days, 0 = once per visitor)" htmlFor="spinRepeatDays">
              <input id="spinRepeatDays" name="spinRepeatDays" type="number" min={0} max={365} className={fieldInput} defaultValue={s[SETTING_KEYS.spinRepeatDays]} />
            </Field>
          </div>

          <label className="mt-5 flex w-fit cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              name="spinEmailRequired"
              defaultChecked={s[SETTING_KEYS.spinEmailRequired] === "1"}
              className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
            />
            Require an email address before they can spin
          </label>
          <p className="mt-2 px-1 text-xs text-slate-400">
            Addresses join the same newsletter list as the footer form, with the
            same unsubscribe link.
          </p>

          <div className="mt-6 flex justify-end">
            <button type="submit" className={`${btnPrimary} px-8`}>Save settings</button>
          </div>
        </SectionCard>
      </form>

      <SectionCard title="Prizes">
        <p className="text-sm text-slate-500">
          Two to eight segments. Chance is relative: a prize with weight 40
          against a total of 100 comes up about 40% of the time. The winner is
          picked on the server, so the odds never reach the browser.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-2 pr-3 font-bold">Prize</th>
                <th className="py-2 pr-3 font-bold">On the wheel</th>
                <th className="py-2 pr-3 font-bold">Coupon</th>
                <th className="py-2 pr-3 font-bold">Chance</th>
                <th className="py-2 pr-3 font-bold">Colour</th>
                <th className="py-2 pr-3 font-bold">Live</th>
                <th className="py-2 font-bold" />
              </tr>
            </thead>
            <tbody>
              {prizes.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-slate-400">No prizes yet.</td></tr>
              ) : (
                prizes.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-3 pr-3 font-medium text-slate-900">{p.label}</td>
                    <td className="py-3 pr-3 text-slate-500">{[p.lineOne, p.lineTwo].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="py-3 pr-3">
                      <span className="font-mono text-[13px]">{p.couponCode}</span>
                      {known.has(p.couponCode) ? null : (
                        <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          no such coupon
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3 tabular-nums text-slate-600">
                      {p.isActive && p.weight > 0 && total > 0 ? `${Math.round((p.weight / total) * 100)}%` : "—"}
                      <span className="ml-1 text-slate-400">({p.weight})</span>
                    </td>
                    <td className="py-3 pr-3">
                      <span className="inline-block h-3.5 w-3.5 rounded align-[-2px]" style={{ background: p.colour }} />
                      <span className="ml-2 font-mono text-[12px] text-slate-500">{p.colour}</span>
                    </td>
                    <td className="py-3 pr-3">{p.isActive ? "Yes" : "No"}</td>
                    <td className="py-3 text-right">
                      <Link href={`/admin/content/spin-win?edit=${p.id}`} className="text-[var(--admin-accent)] underline-offset-4 hover:underline">Edit</Link>
                      <form action={deleteSpinPrize} className="ml-3 inline">
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="text-red-600 underline-offset-4 hover:underline">Delete</button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <form action={saveSpinPrize}>
        <SectionCard title={editing ? `Edit “${editing.label}”` : "Add a prize"}>
          <input type="hidden" name="id" value={editing?.id ?? ""} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Prize name (shown when they win)" htmlFor="label">
              <input id="label" name="label" required className={fieldInput} placeholder="10% off" defaultValue={editing?.label ?? ""} />
            </Field>
            <Field label="Coupon code" htmlFor="couponCode">
              <input id="couponCode" name="couponCode" required list="coupon-codes" className={fieldInput} placeholder="SPIN10" defaultValue={editing?.couponCode ?? ""} />
              <datalist id="coupon-codes">
                {coupons.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.type === "PERCENT" ? `${c.value}% off` : `${(c.value / 100).toFixed(2)} off`}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field label="Wheel text, line 1" htmlFor="lineOne">
              <input id="lineOne" name="lineOne" className={fieldInput} placeholder="10%" defaultValue={editing?.lineOne ?? ""} />
            </Field>
            <Field label="Wheel text, line 2" htmlFor="lineTwo">
              <input id="lineTwo" name="lineTwo" className={fieldInput} placeholder="OFF" defaultValue={editing?.lineTwo ?? ""} />
            </Field>
            <Field label="Chance (relative weight)" htmlFor="weight">
              <input id="weight" name="weight" type="number" min={0} max={1000} className={fieldInput} defaultValue={editing?.weight ?? 25} />
            </Field>
            <Field label="Order on the wheel" htmlFor="sortOrder">
              <input id="sortOrder" name="sortOrder" type="number" min={0} max={99} className={fieldInput} defaultValue={editing?.sortOrder ?? prizes.length} />
            </Field>
            <Field label="Segment colour" htmlFor="colour">
              <input id="colour" name="colour" type="color" className="h-11 w-20 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" defaultValue={editing?.colour ?? "#3D3D44"} />
            </Field>
            <label className="flex items-center gap-2.5 self-end pb-3 text-sm text-slate-700">
              <input type="checkbox" name="isActive" defaultChecked={editing ? editing.isActive : true} className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]" />
              Live on the wheel
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            {editing ? (
              <Link href="/admin/content/spin-win" className="text-sm text-slate-500 underline-offset-4 hover:underline">Cancel</Link>
            ) : null}
            <button type="submit" className={`${btnPrimary} px-8`}>{editing ? "Save prize" : "Add prize"}</button>
          </div>
        </SectionCard>
      </form>
    </div>
  );
}
