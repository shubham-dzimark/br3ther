import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { centsToInput } from "@/lib/money";
import { Card, btnPrimary } from "@/components/admin/ui";
import { Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { CouponUsageFields } from "@/components/admin/CouponUsageFields";
import { usageModeOf } from "@/lib/coupon-usage-mode";
import { updateCoupon } from "../../actions";
import { requireCapability } from "@/lib/permissions";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Edit coupon" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  value: "Percent coupons must be 1–100; fixed coupons need an amount above zero.",
  usage: "Enter how many uses (1 or more) for that usage limit.",
};

export default async function EditCouponPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapability("promotions");
  const [{ id }, { saved, error }, tz, money] = await Promise.all([
    params,
    searchParams,
    getTimeZone(),
    getMoneyFormatter(),
  ]);

  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) notFound();

  const usage = usageModeOf(coupon);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/promotions/coupons"
          aria-label="Back to coupons"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Edit <span className="font-mono">{coupon.code}</span>
        </h1>
      </div>

      {saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {ERRORS[error] ?? "Something went wrong."}
        </p>
      ) : null}

      <Card className="p-6">
        <p className="mb-6 text-sm text-slate-500">
          Used {coupon.timesRedeemed} time{coupon.timesRedeemed === 1 ? "" : "s"} so far
          {coupon.type === "FIXED" ? ` · currently ${money.format(coupon.value)} off` : ` · currently ${coupon.value}% off`}.
        </p>
        <form action={updateCoupon} className="space-y-7" data-coupon-edit-form>
          <input type="hidden" name="id" value={coupon.id} />
          <Field label="Code" htmlFor="code">
            <input id="code" value={coupon.code} readOnly disabled className={`${fieldInput} font-mono`} />
          </Field>
          <p className="-mt-4 px-5 text-xs text-slate-400">
            The code can&rsquo;t be changed: past orders record it, and the per-customer limit
            counts them by code. Create a new coupon for a different code.
          </p>
          <Field label="Type" htmlFor="type">
            <select id="type" name="type" defaultValue={coupon.type} className={fieldSelect}>
              <option value="PERCENT">Percent off</option>
              <option value="FIXED">Fixed amount off</option>
            </select>
          </Field>
          <Field label="Value" htmlFor="value">
            <input
              id="value"
              name="value"
              required
              inputMode="decimal"
              defaultValue={coupon.type === "PERCENT" ? String(coupon.value) : centsToInput(coupon.value)}
              className={fieldInput}
            />
          </Field>
          <p className="-mt-4 px-5 text-xs text-slate-400">
            For percent coupons enter 1&ndash;100. For fixed coupons enter an amount, e.g.{" "}
            {centsToInput(1000)}.
          </p>
          <Field label="Minimum subtotal" htmlFor="minSubtotal">
            <input
              id="minSubtotal"
              name="minSubtotal"
              inputMode="decimal"
              defaultValue={coupon.minSubtotalCents > 0 ? centsToInput(coupon.minSubtotalCents) : ""}
              placeholder="0.00"
              className={fieldInput}
            />
          </Field>
          <CouponUsageFields defaultMode={usage.mode} defaultCount={usage.count} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts" htmlFor="startsAt">
              <input
                id="startsAt"
                name="startsAt"
                type="date"
                defaultValue={coupon.startsAt ? ymd(coupon.startsAt, tz) : ""}
                className={fieldInput}
              />
            </Field>
            <Field label="Ends" htmlFor="endsAt">
              <input
                id="endsAt"
                name="endsAt"
                type="date"
                defaultValue={coupon.endsAt ? ymd(coupon.endsAt, tz) : ""}
                className={fieldInput}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="description">
            <input id="description" name="description" defaultValue={coupon.description ?? ""} className={fieldInput} />
          </Field>
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={coupon.isActive}
              className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
            />
            Active
          </label>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              href="/admin/promotions/coupons"
              className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button type="submit" className={btnPrimary}>
              Save coupon
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
