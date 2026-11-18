import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { centsToInput } from "@/lib/money";
import { Card, btnPrimary } from "@/components/admin/ui";
import { Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { IconTrash } from "@/components/admin/Icons";
import { TH, Empty } from "@/components/admin/PageCard";
import { CouponUsageFields } from "@/components/admin/CouponUsageFields";
import { createCoupon, deleteCoupon, setFeaturedCoupon, toggleCoupon } from "../actions";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { featurable } from "@/lib/featured-coupon";
import { requireCapability } from "@/lib/permissions";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Coupon" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  code: "A coupon code is required.",
  value: "Percent coupons must be 1–100; fixed coupons need an amount above zero.",
  duplicate: "That code already exists.",
  featured: "That coupon no longer exists.",
  personal: "The welcome popup's code is personal to one email address, so it can't be featured to everyone.",
  usage: "Enter how many uses (1 or more) for that usage limit.",
};

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const tz = await getTimeZone();
  await requireCapability("promotions");
  const [{ saved, error }, coupons, money, settings] = await Promise.all([
    searchParams,
    prisma.coupon.findMany({ orderBy: { createdAt: "desc" } }),
    getMoneyFormatter(),
    getSettings(),
  ]);
  const featuredCode = (settings[SETTING_KEYS.checkoutFeaturedCoupon] ?? "").trim().toUpperCase();
  const featuredCoupon = coupons.find((c) => c.code === featuredCode) ?? null;
  const personalCode = settings[SETTING_KEYS.promoPopupCoupon] ?? "";

  const now = new Date();

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
            <h1 className="text-xl font-semibold text-slate-900">Coupons</h1>
            {saved ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                Saved
              </span>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="mx-6 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {ERRORS[error] ?? "Something went wrong."}
            </p>
          ) : null}

          <div className="h-5" />

          {coupons.length === 0 ? (
            <Empty>No coupons yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full ">
                <thead className="bg-slate-50/80">
                  <tr>
                    <TH>Code</TH>
                    <TH>Discount</TH>
                    <TH>Window</TH>
                    <TH align="right">Used</TH>
                    <TH>Status</TH>
                    <TH align="right">Action</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coupons.map((c) => {
                    const expired = c.endsAt ? c.endsAt < now : false;
                    const notStarted = c.startsAt ? c.startsAt > now : false;
                    const live = c.isActive && !expired && !notStarted;

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/60">
                        <td className="px-3 lg:px-5 py-4">
                          <span className="block font-mono text-sm font-semibold text-slate-900">
                            {c.code}
                          </span>
                          {c.description ? (
                            <span className="block text-xs text-slate-400">
                              {c.description}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 lg:px-5 py-4 text-sm text-slate-700">
                          {c.type === "PERCENT"
                            ? `${c.value}% off`
                            : `${money.format(c.value)} off`}
                          {c.minSubtotalCents > 0 ? (
                            <span className="block text-xs text-slate-400">
                              min {money.format(c.minSubtotalCents)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 lg:px-5 py-4 text-xs text-slate-500">
                          {c.startsAt ? ymd(c.startsAt, tz) : "—"}
                          {" → "}
                          {c.endsAt ? ymd(c.endsAt, tz) : "—"}
                        </td>
                        <td className="px-3 lg:px-5 py-4 text-right text-sm tabular-nums text-slate-600">
                          {c.maxPerCustomer != null ? (
                            <>
                              {`${c.timesRedeemed} used`}
                              <span className="block text-xs text-slate-400">
                                {`${c.maxPerCustomer} per customer`}
                              </span>
                            </>
                          ) : c.maxRedemptions != null ? (
                            `${c.timesRedeemed} / ${c.maxRedemptions}`
                          ) : (
                            <>
                              {c.timesRedeemed}
                              <span className="block text-xs text-slate-400">unlimited</span>
                            </>
                          )}
                        </td>
                        <td className="px-3 lg:px-5 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                              live
                                ? "bg-emerald-50 text-emerald-700"
                                : expired
                                  ? "bg-slate-100 text-slate-500"
                                  : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {live ? "Active" : expired ? "Expired" : notStarted ? "Scheduled" : "Paused"}
                          </span>
                        </td>
                        <td className="px-3 lg:px-5 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/admin/promotions/coupons/${c.id}`}
                              data-coupon-edit
                              className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                            >
                              Edit
                            </Link>
                            <form action={toggleCoupon}>
                              <input type="hidden" name="id" value={c.id} />
                              <input type="hidden" name="active" value={c.isActive ? "0" : "1"} />
                              <button
                                type="submit"
                                className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                              >
                                {c.isActive ? "Pause" : "Resume"}
                              </button>
                            </form>
                            <form action={deleteCoupon}>
                              <input type="hidden" name="id" value={c.id} />
                              <button
                                type="submit"
                                aria-label={`Delete ${c.code}`}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <IconTrash className="h-[17px] w-[17px]" />
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="h-fit space-y-5">
      <Card className="p-6">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">Feature a code at checkout</h2>
        <p className="mb-5 text-xs text-slate-500">
          The cart and checkout show a highlighted &ldquo;Use code &hellip;&rdquo; banner with a
          one-click Apply button. It hides itself while the coupon is paused, outside its dates or
          used up.
        </p>
        <form action={setFeaturedCoupon} className="space-y-5">
          <Field label="Featured code" htmlFor="featuredCode">
            <select id="featuredCode" name="featuredCode" defaultValue={featuredCode} className={fieldSelect}>
              <option value="">None</option>
              {coupons.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code} &mdash; {c.type === "PERCENT" ? `${c.value}% off` : `${money.format(c.value)} off`}
                </option>
              ))}
            </select>
          </Field>
          {featuredCode ? (
            featurable(featuredCoupon, now, personalCode) ? (
              <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                {featuredCode} is showing on the cart and checkout now.
              </p>
            ) : (
              <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
                {featuredCode} is chosen but not showing: it&rsquo;s paused, outside its dates, used up,
                or no longer exists.
              </p>
            )
          ) : null}
          <button type="submit" className={btnPrimary}>
            Save featured code
          </button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="mb-6 text-lg font-semibold text-slate-900">New coupon</h2>
        <form action={createCoupon} className="space-y-7">
          <Field label="Code" htmlFor="code">
            <input id="code" name="code" required placeholder="WELCOME10" className={fieldInput} />
          </Field>
          <Field label="Type" htmlFor="type">
            <select id="type" name="type" className={fieldSelect}>
              <option value="PERCENT">Percent off</option>
              <option value="FIXED">Fixed amount off</option>
            </select>
          </Field>
          <Field label="Value" htmlFor="value">
            <input id="value" name="value" required inputMode="decimal" placeholder="10" className={fieldInput} />
          </Field>
          <p className="-mt-4 px-5 text-xs text-slate-400">
            For percent coupons enter 1&ndash;100. For fixed coupons enter an
            amount, e.g. {centsToInput(1000)}.
          </p>
          <Field label="Minimum subtotal" htmlFor="minSubtotal">
            <input id="minSubtotal" name="minSubtotal" inputMode="decimal" placeholder="0.00" className={fieldInput} />
          </Field>
          <CouponUsageFields />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts" htmlFor="startsAt">
              <input id="startsAt" name="startsAt" type="date" className={fieldInput} />
            </Field>
            <Field label="Ends" htmlFor="endsAt">
              <input id="endsAt" name="endsAt" type="date" className={fieldInput} />
            </Field>
          </div>
          <Field label="Description" htmlFor="description">
            <input id="description" name="description" className={fieldInput} />
          </Field>
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]" />
            Active immediately
          </label>
          <button type="submit" className={btnPrimary}>
            Create coupon
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-400">
          Customers enter codes on the cart or checkout. Only one discount applies
          per order (coupon, referral or points), whichever saves the most.
        </p>
      </Card>
      </div>
    </div>
  );
}
