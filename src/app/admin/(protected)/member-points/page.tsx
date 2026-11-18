import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";
import { getLoyaltyConfig, pointsToCents } from "@/lib/loyalty";
import { ADMIN_ADJUST_MESSAGES, type AdminAdjustError } from "@/lib/loyalty-admin";
import { Card } from "@/components/admin/ui";
import { TH, Empty } from "@/components/admin/PageCard";
import { IconSearch } from "@/components/admin/Icons";
import { getTimeZone, ymd } from "@/lib/timezone";
import { addMemberPoints } from "./actions";

export const metadata: Metadata = { title: "Member Points" };
export const dynamic = "force-dynamic";

const HOME = "/admin/member-points";
const PER_PAGE = 50;

const FILTERS = [
  { value: "", label: "All members" },
  { value: "with", label: "With points" },
  { value: "none", label: "No points" },
] as const;

const SORTS = [
  { value: "", label: "Highest balance" },
  { value: "name", label: "Name A–Z" },
  { value: "newest", label: "Newest members" },
] as const;

type Search = {
  q?: string;
  filter?: string;
  sort?: string;
  page?: string;
  saved?: string;
  pts?: string;
  error?: string;
};

/** This screen's URL with some parameters changed, keeping the rest. */
function hrefWith(sp: Search, changes: Partial<Record<keyof Search, string>>): string {
  const params = new URLSearchParams();
  const merged = { q: sp.q, filter: sp.filter, sort: sp.sort, page: sp.page, ...changes };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${HOME}?${qs}` : HOME;
}

/**
 * Member Points: every customer's loyalty balance in one list, with a way to
 * add or remove points on the spot. Changes go through the same helper as the
 * customer page, so each one leaves an audit row naming the admin.
 */
export default async function MemberPointsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireCapability("customers");
  const sp = await searchParams;
  const tz = await getTimeZone();

  const q = (sp.q ?? "").trim().slice(0, 100);
  const filter = FILTERS.some((f) => f.value === sp.filter) ? (sp.filter ?? "") : "";
  const sort = SORTS.some((s) => s.value === sp.sort) ? (sp.sort ?? "") : "";
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));

  const where: Prisma.CustomerWhereInput = {
    AND: [
      // Members are registered accounts; guest checkout records earn nothing.
      { passwordHash: { not: null } },
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { referralCode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      filter === "with" ? { pointsBalance: { gt: 0 } } : {},
      filter === "none" ? { pointsBalance: 0 } : {},
    ],
  };

  const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
    sort === "name"
      ? [{ name: "asc" }, { email: "asc" }]
      : sort === "newest"
        ? [{ createdAt: "desc" }]
        : [{ pointsBalance: "desc" }, { createdAt: "desc" }];

  const [members, matching, totals, holders, redeemed, recent, money, config, savedMember] =
    await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy,
        skip: (page - 1) * PER_PAGE,
        take: PER_PAGE,
        select: {
          id: true,
          name: true,
          email: true,
          referralCode: true,
          pointsBalance: true,
          createdAt: true,
          _count: { select: { orders: true } },
          loyalty: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true, points: true, type: true },
          },
        },
      }),
      prisma.customer.count({ where }),
      prisma.customer.aggregate({
        where: { passwordHash: { not: null } },
        _sum: { pointsBalance: true },
        _count: { _all: true },
      }),
      prisma.customer.count({ where: { pointsBalance: { gt: 0 }, passwordHash: { not: null } } }),
      prisma.loyaltyTransaction.aggregate({ _sum: { points: true }, where: { type: "REDEEMED" } }),
      prisma.loyaltyTransaction.findMany({
        where: { type: "ADJUSTED" },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          points: true,
          note: true,
          createdAt: true,
          customer: { select: { id: true, name: true, email: true } },
        },
      }),
      getMoneyFormatter(),
      getLoyaltyConfig(),
      sp.saved
        ? prisma.customer.findUnique({
            where: { id: sp.saved },
            select: { name: true, email: true, pointsBalance: true },
          })
        : null,
    ]);

  const outstanding = totals._sum.pointsBalance ?? 0;
  const redeemedPoints = Math.abs(redeemed._sum.points ?? 0);
  const pages = Math.max(1, Math.ceil(matching / PER_PAGE));
  const savedPts = Math.trunc(Number(sp.pts) || 0);
  const errorMessage = sp.error
    ? (ADMIN_ADJUST_MESSAGES[sp.error as AdminAdjustError] ?? "Something went wrong.")
    : null;
  const currentHref = hrefWith(sp, {});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Member Points</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every member&rsquo;s loyalty balance. Add points as a goodwill gesture or
          correction &mdash; each change is recorded with your name.
        </p>
      </div>

      {savedMember ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {savedPts >= 0 ? "Added" : "Removed"} <strong>{Math.abs(savedPts)} points</strong>{" "}
          {savedPts >= 0 ? "to" : "from"} {savedMember.name || savedMember.email}. New balance:{" "}
          <strong>{savedMember.pointsBalance} points</strong>.
        </p>
      ) : null}
      {errorMessage ? (
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {errorMessage}
        </p>
      ) : null}
      {!config.enabled ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          The points programme is switched off, so members can&rsquo;t earn or spend points
          at checkout right now. Balances are kept.{" "}
          <Link href="/admin/settings/loyalty" className="font-medium text-[var(--admin-accent)] hover:underline">
            Points settings
          </Link>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#E2EEEA] p-5">
          <p className="text-sm font-medium text-slate-700">Points outstanding</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{outstanding.toLocaleString("en-CA")}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            liability <span title={money.format(pointsToCents(outstanding, config))}>{money.compact(pointsToCents(outstanding, config))}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-[#FBEFB9] p-5">
          <p className="text-sm font-medium text-slate-700">Members with points</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{holders.toLocaleString("en-CA")}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            of {totals._count._all.toLocaleString("en-CA")} members
          </p>
        </div>
        <div className="rounded-2xl bg-[#E3EAF3] p-5">
          <p className="text-sm font-medium text-slate-700">Points redeemed</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{redeemedPoints.toLocaleString("en-CA")}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            worth <span title={money.format(pointsToCents(redeemedPoints, config))}>{money.compact(pointsToCents(redeemedPoints, config))}</span>
          </p>
        </div>
      </div>

      <form action={HOME} className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search members</span>
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name, email or referral code"
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[var(--admin-accent)]"
          />
        </label>
        {filter ? <input type="hidden" name="filter" value={filter} /> : null}
        <select
          name="sort"
          defaultValue={sort}
          aria-label="Sort members"
          className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:border-[var(--admin-accent)]"
        >
          {SORTS.map((s) => (
            <option key={s.label} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-full bg-[var(--admin-btn)] px-5 py-2.5 text-sm font-medium text-[var(--admin-btn-ink)] transition hover:brightness-110"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <Link
              key={f.label}
              href={hrefWith(sp, { filter: f.value, page: "" })}
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
        {members.length === 0 ? (
          <div className="py-8">
            <Empty>{q || filter ? "No members match." : "No members yet."}</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80">
                <tr>
                  <TH>Member</TH>
                  <TH>Referral code</TH>
                  <TH align="right">Orders</TH>
                  <TH align="right">Balance</TH>
                  <TH>Last points activity</TH>
                  <TH align="right">Add points</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => {
                  const last = m.loyalty[0];
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-4 lg:px-5">
                        <Link
                          href={`/admin/customers/${m.id}`}
                          className="text-sm font-medium text-slate-900 hover:text-[var(--admin-accent)]"
                        >
                          {m.name || m.email}
                        </Link>
                        <span className="block text-xs text-slate-400">{m.email}</span>
                      </td>
                      <td className="px-3 py-4 font-mono text-sm text-slate-600 lg:px-5">
                        {m.referralCode ?? <span className="text-slate-300">&mdash;</span>}
                      </td>
                      <td className="px-3 py-4 text-right text-sm tabular-nums text-slate-600 lg:px-5">
                        {m._count.orders}
                      </td>
                      <td className="px-3 py-4 text-right lg:px-5">
                        <span className="block text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                          {m.pointsBalance.toLocaleString("en-CA")} pts
                        </span>
                        <span className="block text-xs text-slate-400" title={money.format(pointsToCents(m.pointsBalance, config))}>
                          {money.compact(pointsToCents(m.pointsBalance, config))}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-600 lg:px-5">
                        {last ? (
                          <>
                            <span className={last.points >= 0 ? "text-[var(--admin-accent)]" : "text-red-600"}>
                              {last.points >= 0 ? "+" : ""}
                              {last.points}
                            </span>{" "}
                            <span className="text-xs text-slate-400">
                              {last.type.toLowerCase()} · {ymd(last.createdAt, tz)}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-slate-300">No activity</span>
                        )}
                      </td>
                      <td className="px-3 py-4 lg:px-5">
                        <form action={addMemberPoints} className="flex items-center justify-end gap-1.5">
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="back" value={currentHref} />
                          <input
                            name="points"
                            type="number"
                            step="1"
                            required
                            placeholder="+100"
                            aria-label={`Points to add for ${m.name || m.email} (use a minus sign to remove)`}
                            className="w-24 rounded-full border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[var(--admin-accent)]"
                          />
                          <input
                            name="note"
                            maxLength={200}
                            placeholder="Reason"
                            aria-label={`Reason for ${m.name || m.email}`}
                            className="w-32 rounded-full border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[var(--admin-accent)]"
                          />
                          <button
                            type="submit"
                            className="rounded-full bg-[var(--admin-btn)] px-3.5 py-1.5 text-xs font-medium text-[var(--admin-btn-ink)] transition hover:brightness-110"
                          >
                            Add
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 ? (
        <div className="flex items-center justify-between px-1 text-sm text-slate-500">
          <span>
            Page {Math.min(page, pages)} of {pages} · {matching.toLocaleString("en-CA")} members
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={hrefWith(sp, { page: String(page - 1) })}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50"
              >
                Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={hrefWith(sp, { page: String(page + 1) })}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Recent adjustments</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No points have been adjusted by hand yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {recent.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 text-slate-600">
                  <Link
                    href={`/admin/customers/${t.customer.id}`}
                    className="font-medium text-slate-900 hover:text-[var(--admin-accent)]"
                  >
                    {t.customer.name || t.customer.email}
                  </Link>{" "}
                  &middot; {t.note ?? "adjusted"}
                  <span className="ml-2 text-xs text-slate-400">{ymd(t.createdAt, tz)}</span>
                </span>
                <span className={t.points >= 0 ? "font-semibold text-[var(--admin-accent)]" : "font-semibold text-red-600"}>
                  {t.points >= 0 ? "+" : ""}
                  {t.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="px-1 text-xs text-slate-400">
        {config.redeemRate} points = {money.format(100)}. Use a minus sign to take points
        away; a balance can&rsquo;t go below zero. Change the earning and redemption
        rates under Settings &rarr; Points &amp; Referrals.
      </p>
    </div>
  );
}
