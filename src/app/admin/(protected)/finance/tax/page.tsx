import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getMoneyFormatter } from "@/lib/currency";
import { SectionCard, Field, fieldInput } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { saveTaxSettings } from "../../settings/actions";
import { requireCapability } from "@/lib/permissions";

export const metadata: Metadata = { title: "Tax" };
export const dynamic = "force-dynamic";

const PAID = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

export default async function TaxPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("finance");
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const [{ saved }, s, money, collected, collectedYtd] = await Promise.all([
    searchParams,
    getSettings(),
    getMoneyFormatter(),
    prisma.order.aggregate({
      _sum: { taxCents: true },
      where: { status: { in: [...PAID] } },
    }),
    prisma.order.aggregate({
      _sum: { taxCents: true },
      where: { status: { in: [...PAID] }, createdAt: { gte: yearStart } },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Tax</h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#E2EEEA] p-5">
          <p className="text-sm font-medium text-slate-700">Collected all time</p>
          <p className="mt-2 text-[26px] font-semibold text-slate-900">
            <span title={money.format(collected._sum.taxCents ?? 0)}>{money.compact(collected._sum.taxCents ?? 0)}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-[#F5EDDA] p-5">
          <p className="text-sm font-medium text-slate-700">Collected this year</p>
          <p className="mt-2 text-[26px] font-semibold text-slate-900">
            <span title={money.format(collectedYtd._sum.taxCents ?? 0)}>{money.compact(collectedYtd._sum.taxCents ?? 0)}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-[#E3EAF3] p-5">
          <p className="text-sm font-medium text-slate-700">Current rate</p>
          <p className="mt-2 text-[26px] font-semibold text-slate-900">
            {s[SETTING_KEYS.taxPercent]}%
          </p>
        </div>
      </div>

      <form action={saveTaxSettings} className="space-y-5">
        <SectionCard title="Tax configuration">
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-3">
            <Field label="Tax rate (%)" htmlFor="taxPercent">
              <input
                id="taxPercent"
                name="taxPercent"
                inputMode="decimal"
                defaultValue={s[SETTING_KEYS.taxPercent]}
                className={fieldInput}
              />
            </Field>
            <Field label="Label shown to customers" htmlFor="taxLabel">
              <input
                id="taxLabel"
                name="taxLabel"
                defaultValue={s[SETTING_KEYS.taxLabel]}
                placeholder="GST/HST, VAT, Sales tax"
                className={fieldInput}
              />
            </Field>
            <Field label="Registration number" htmlFor="taxNumber">
              <input
                id="taxNumber"
                name="taxNumber"
                defaultValue={s[SETTING_KEYS.taxNumber]}
                placeholder="Printed on invoices"
                className={fieldInput}
              />
            </Field>
          </div>

          <label className="mt-7 flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="taxInclusive"
              defaultChecked={s[SETTING_KEYS.taxInclusive] === "1"}
              className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
            />
            Prices already include tax
          </label>
          <p className="mt-2 text-xs text-slate-400">
            When on, the tax shown at checkout is broken out of the price rather
            than added on top.
          </p>
        </SectionCard>

        <div className="flex justify-end pb-2">
          <button type="submit" className={`${btnPrimary} px-8`}>
            Save tax settings
          </button>
        </div>
      </form>

      <p className="px-1 text-xs text-slate-400">
        These figures report what the store charged. They are not tax advice, and
        filing obligations depend on where you are registered.
      </p>
    </div>
  );
}
