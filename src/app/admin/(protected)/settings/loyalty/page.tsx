import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getMoneyFormatter } from "@/lib/currency";
import { getLoyaltyConfig, pointsToCents } from "@/lib/loyalty";
import { SectionCard, Field, fieldInput } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { saveLoyaltySettings } from "../actions";

export const metadata: Metadata = { title: "Points & referrals" };
export const dynamic = "force-dynamic";

export default async function LoyaltySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("settings");

  const [{ saved }, s, money, config, issued, redeemed, referrals] =
    await Promise.all([
      searchParams,
      getSettings(),
      getMoneyFormatter(),
      getLoyaltyConfig(),
      prisma.loyaltyTransaction.aggregate({
        _sum: { points: true },
        where: { points: { gt: 0 } },
      }),
      prisma.loyaltyTransaction.aggregate({
        _sum: { points: true },
        where: { points: { lt: 0 } },
      }),
      prisma.referralEvent.count({ where: { status: "REWARDED" } }),
    ]);

  const outstanding =
    (issued._sum.points ?? 0) + (redeemed._sum.points ?? 0); // redeemed is negative

  return (
    <form action={saveLoyaltySettings} className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Points &amp; referrals
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#E2EEEA] p-5">
          <p className="text-sm font-medium text-slate-700">Points outstanding</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{outstanding}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            liability <span title={money.format(pointsToCents(outstanding, config))}>{money.compact(pointsToCents(outstanding, config))}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-[#F5EDDA] p-5">
          <p className="text-sm font-medium text-slate-700">Points redeemed</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">
            {Math.abs(redeemed._sum.points ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl bg-[#E3EAF3] p-5">
          <p className="text-sm font-medium text-slate-700">Referrals rewarded</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{referrals}</p>
        </div>
      </div>

      <SectionCard title="Scheme">
        <label className="mb-7 flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="loyaltyEnabled"
            defaultChecked={s[SETTING_KEYS.loyaltyEnabled] === "1"}
            className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
          />
          Points programme is running
        </label>

        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label={`Points earned per ${money.format(100)} spent`} htmlFor="loyaltyEarnRate">
            <input
              id="loyaltyEarnRate"
              name="loyaltyEarnRate"
              type="number"
              min="0"
              defaultValue={s[SETTING_KEYS.loyaltyEarnRate]}
              className={fieldInput}
            />
          </Field>
          <Field label={`Points needed for ${money.format(100)} off`} htmlFor="loyaltyRedeemRate">
            <input
              id="loyaltyRedeemRate"
              name="loyaltyRedeemRate"
              type="number"
              min="1"
              defaultValue={s[SETTING_KEYS.loyaltyRedeemRate]}
              className={fieldInput}
            />
          </Field>
          <Field label="Minimum points per redemption" htmlFor="loyaltyMinRedeem">
            <input
              id="loyaltyMinRedeem"
              name="loyaltyMinRedeem"
              type="number"
              min="0"
              defaultValue={s[SETTING_KEYS.loyaltyMinRedeem]}
              className={fieldInput}
            />
          </Field>
          <Field label="Max share of an order points can cover (%)" htmlFor="loyaltyMaxDiscountPercent">
            <input
              id="loyaltyMaxDiscountPercent"
              name="loyaltyMaxDiscountPercent"
              type="number"
              min="0"
              max="100"
              defaultValue={s[SETTING_KEYS.loyaltyMaxDiscountPercent]}
              className={fieldInput}
            />
          </Field>
        </div>

        <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-4 text-xs text-slate-600">
          <p>
            <strong className="text-slate-900">{config.redeemRate} points</strong> ={" "}
            {money.format(100)}. A {money.format(10000)} order earns{" "}
            <strong className="text-slate-900">{config.earnRate * 100} points</strong>,
            worth {money.format(pointsToCents(config.earnRate * 100, config))}.
          </p>
          <p className="mt-2">
            That is an effective reward of{" "}
            <strong className="text-slate-900">
              {((config.earnRate / config.redeemRate) * 100).toFixed(1)}%
            </strong>{" "}
            back on every order.
          </p>
          {config.earnRate >= config.redeemRate ? (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
              Careful: customers earn points at least as fast as they spend them,
              so every order effectively pays for the next one. Earn rate should
              normally be far smaller than the redeem rate.
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Bonuses">
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label="Signup bonus (points)" htmlFor="loyaltySignupBonus">
            <input
              id="loyaltySignupBonus"
              name="loyaltySignupBonus"
              type="number"
              min="0"
              defaultValue={s[SETTING_KEYS.loyaltySignupBonus]}
              className={fieldInput}
            />
          </Field>
          <Field label="Referral reward (points)" htmlFor="loyaltyReferralPoints">
            <input
              id="loyaltyReferralPoints"
              name="loyaltyReferralPoints"
              type="number"
              min="0"
              defaultValue={s[SETTING_KEYS.loyaltyReferralPoints]}
              className={fieldInput}
            />
          </Field>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field
            label={`Friend must spend at least (${money.currency})`}
            htmlFor="referralMinSpend"
          >
            <input
              id="referralMinSpend"
              name="referralMinSpend"
              type="number"
              min="0"
              step="0.01"
              defaultValue={(
                Number(s[SETTING_KEYS.referralMinSpendCents] ?? 0) / 100
              ).toFixed(2)}
              className={fieldInput}
            />
          </Field>
          <Field
            label={`Discount the friend gets at checkout (${money.currency})`}
            htmlFor="referralFriendDiscount"
          >
            <input
              id="referralFriendDiscount"
              name="referralFriendDiscount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={(
                Number(s[SETTING_KEYS.referralFriendDiscountCents] ?? 0) / 100
              ).toFixed(2)}
              className={fieldInput}
            />
          </Field>
        </div>

        <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
          The referral page headline reads{" "}
          <strong className="text-slate-900">
            &ldquo;Give {money.format(config.referralFriendDiscountCents)} and get{" "}
            {config.referralPoints} Member Points when your friend spends{" "}
            {money.format(config.referralMinSpendCents)} or more&rdquo;
          </strong>{" "}
          &mdash; built from these fields, so it can never advertise an offer you
          aren&rsquo;t actually running.
        </p>

        <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
          The homepage advertises the signup bonus as{" "}
          <strong className="text-slate-900">
            {money.format(pointsToCents(config.signupBonusPoints, config))}
          </strong>{" "}
          &mdash; that figure is calculated from these two fields, so the promo can
          never claim a different amount from what&rsquo;s actually awarded.
        </p>

        <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
          <li>Signup bonus is awarded once per account, on registration.</li>
          <li>
            A customer&rsquo;s referral code only appears on their referral page
            after they have an order with a <strong className="text-slate-700">
            confirmed payment</strong> of at least the threshold above.
          </li>
          <li>
            Order points and referral rewards are awarded when a payment is
            <strong className="text-slate-700"> confirmed</strong>, not when an order
            is placed &mdash; that&rsquo;s what stops referrals being farmed.
          </li>
          <li>Cancelling or refunding an order gives redeemed points back.</li>
        </ul>
      </SectionCard>

      <div className="flex justify-end pb-2">
        <button type="submit" className={`${btnPrimary} px-8`}>
          Save points settings
        </button>
      </div>
    </form>
  );
}
