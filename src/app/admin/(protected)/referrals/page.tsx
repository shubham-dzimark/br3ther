import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";
import { getLoyaltyConfig, pointsToCents } from "@/lib/loyalty";
import { Card } from "@/components/admin/ui";
import { TH, Empty } from "@/components/admin/PageCard";
import { payReferral, setReferralStatus } from "./actions";
import type { ReferralStatus } from "@/generated/prisma";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Referrals" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "REWARDED", label: "Rewarded" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

const TONE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  QUALIFIED: "bg-sky-50 text-sky-700",
  REWARDED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

const ERRORS: Record<string, string> = {
  already: "That referral was already rewarded.",
  guest: "The referrer is a guest with no account, so no points can be paid until they create one.",
  points: "Enter a positive number of points.",
  use_pay: "Use the Pay button so the points are actually credited.",
};

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; saved?: string; error?: string }>;
}) {
  const tz = await getTimeZone();
  await requireCapability("customers");
  const sp = await searchParams;
  const status = FILTERS.some((f) => f.value === sp.status && f.value !== "")
    ? (sp.status as ReferralStatus)
    : undefined;

  const [events, money, config, rewardedAgg] = await Promise.all([
    prisma.referralEvent.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { referrer: { select: { id: true, email: true, name: true } } },
    }),
    getMoneyFormatter(),
    getLoyaltyConfig(),
    prisma.referralEvent.aggregate({
      _sum: { rewardCents: true },
      _count: { _all: true },
      where: { status: "REWARDED" },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Referrals
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Referrers are paid automatically when the referred order&rsquo;s payment
          is confirmed. Use Pay here only for cases that rule didn&rsquo;t cover.
        </p>
      </div>

      {sp.saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </p>
      ) : null}
      {sp.error ? (
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {ERRORS[sp.error] ?? "Something went wrong."}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#E2EEEA] p-5">
          <p className="text-sm font-medium text-slate-700">Referrals recorded</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{events.length}</p>
        </div>
        <div className="rounded-2xl bg-[#E4EEDE] p-5">
          <p className="text-sm font-medium text-slate-700">Rewarded</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">
            {rewardedAgg._count._all}
          </p>
        </div>
        <div className="rounded-2xl bg-[#E3EAF3] p-5">
          <p className="text-sm font-medium text-slate-700">Value paid out</p>
          <p className="mt-2 text-xl font-semibold text-slate-900" title={money.format(rewardedAgg._sum.rewardCents ?? 0)}>
            {money.compact(rewardedAgg._sum.rewardCents ?? 0)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = (status ?? "") === f.value;
          return (
            <Link
              key={f.label}
              href={f.value ? `/admin/referrals?status=${f.value}` : "/admin/referrals"}
              className={`rounded-full px-4 py-2 text-sm transition ${
                active
                  ? "bg-[var(--admin-btn)] font-medium text-[var(--admin-btn-ink)]"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {events.length === 0 ? (
          <div className="py-8">
            <Empty>No referrals recorded yet.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full ">
              <thead className="bg-slate-50/80">
                <tr>
                  <TH>Referrer</TH>
                  <TH>Code</TH>
                  <TH>Referred</TH>
                  <TH>Status</TH>
                  <TH align="right">Reward</TH>
                  <TH align="right">Action</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60">
                    <td className="px-3 lg:px-5 py-4">
                      <Link
                        href={`/admin/customers/${e.referrer.id}`}
                        className="text-sm font-medium text-slate-900 hover:text-[var(--admin-accent)]"
                      >
                        {e.referrer.name ?? e.referrer.email}
                      </Link>
                      <span className="block text-xs text-slate-400">
                        {e.referrer.email}
                      </span>
                    </td>
                    <td className="px-3 lg:px-5 py-4 font-mono text-sm text-slate-600">
                      {e.code}
                    </td>
                    <td className="px-3 lg:px-5 py-4">
                      <span className="block text-sm text-slate-700">
                        {e.referredEmail}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {ymd(e.createdAt, tz)}
                        {e.orderId ? " · has order" : " · no order yet"}
                      </span>
                    </td>
                    <td className="px-3 lg:px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          TONE[e.status] ?? "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {e.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 lg:px-5 py-4 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                      {e.rewardCents > 0 ? money.formatIn(e.rewardCents) : "—"}
                    </td>
                    <td className="px-3 lg:px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {e.status !== "REWARDED" && e.status !== "CANCELLED" ? (
                          <>
                            <form action={payReferral} className="flex items-center gap-1.5">
                              <input type="hidden" name="id" value={e.id} />
                              <input
                                name="points"
                                type="number"
                                min="1"
                                defaultValue={config.referralPoints}
                                aria-label="Points to award"
                                className="w-20 rounded-full border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[var(--admin-accent)]"
                              />
                              <button
                                type="submit"
                                className="rounded-full bg-[var(--admin-btn)] px-3.5 py-1.5 text-xs font-medium text-[var(--admin-btn-ink)] transition hover:brightness-110"
                              >
                                Pay
                              </button>
                            </form>
                            <form action={setReferralStatus}>
                              <input type="hidden" name="id" value={e.id} />
                              <input type="hidden" name="status" value="CANCELLED" />
                              <button
                                type="submit"
                                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </form>
                          </>
                        ) : (
                          <span className="text-xs text-slate-300">&mdash;</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="px-1 text-xs text-slate-400">
        At the current rate, {config.referralPoints} points is worth{" "}
        {money.format(pointsToCents(config.referralPoints, config))}. Change it
        under Settings &rarr; Points &amp; referrals.
      </p>
    </div>
  );
}
