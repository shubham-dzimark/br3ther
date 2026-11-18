import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card } from "@/components/admin/ui";
import Link from "next/link";
import { IconPencil, IconSearch } from "@/components/admin/Icons";
import { BulkBar, BulkCheckbox, BulkMaster } from "@/components/admin/BulkBar";
import {
  bulkDeleteCustomers,
  bulkDeleteGuests,
  bulkIssueReferralCodes,
  bulkSendGuestInvites,
  bulkSendResetEmails,
} from "./actions";
import type { Prisma } from "@/generated/prisma";
import { requireCapability, can } from "@/lib/permissions";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

const PAID = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

/** A registered account has a password; a guest checkout record does not. */
const REGISTERED: Prisma.CustomerWhereInput = { passwordHash: { not: null } };
const GUEST: Prisma.CustomerWhereInput = { passwordHash: null };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bulk?: string; n?: string; f?: string; u?: string; view?: string }>;
}) {
  const me = await requireCapability("customers");
  const tz = await getTimeZone();
  const canExport = can(me.role, "customer_pii");
  const { q: rawQ, bulk, n, f, u, view } = await searchParams;
  const q = (rawQ ?? "").trim();
  const failedSends = Math.max(0, Number(f) || 0);
  const unsubscribed = Math.max(0, Number(u) || 0);
  /*
   * Guests is a separate, read-only tab. A guest checked out without an
   * account: their record is kept for order history, but nothing here acts on
   * it - no edits, points or referral codes - until they create an
   * account themselves. Staff can export guests, email them an invite to
   * register, or delete the record; the other actions refuse guest records.
   */
  const guests = view === "guests";

  const search: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [money, customers, customerCount, guestCount] = await Promise.all([
    getMoneyFormatter(),
    prisma.customer.findMany({
      where: { AND: [search, guests ? GUEST : REGISTERED] },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        orders: {
          select: { totalCents: true, status: true, createdAt: true },
        },
      },
    }),
    prisma.customer.count({ where: { AND: [search, REGISTERED] } }),
    prisma.customer.count({ where: { AND: [search, GUEST] } }),
  ]);

  const tabHref = (guestTab: boolean) => {
    const params = new URLSearchParams();
    if (guestTab) params.set("view", "guests");
    if (q) params.set("q", q);
    const s = params.toString();
    return `/admin/customers${s ? `?${s}` : ""}`;
  };
  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
      active ? "bg-[var(--admin-btn)] text-[var(--admin-btn-ink)]" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
    }`;
  const countClass = (active: boolean) =>
    `rounded-full px-2 py-0.5 text-xs tabular-nums ${active ? "bg-white/20 text-[var(--on-colour)]" : "bg-slate-100 text-slate-500"}`;

  const selectable = canExport;
  // Separate form ids, so a guest selection can only reach the guest action.
  const bulkFormId = guests ? "bulk-guests" : "bulk-customers";
  const exportParams = new URLSearchParams();
  if (guests) exportParams.set("view", "guests");
  if (q) exportParams.set("q", q);
  const exportQuery = exportParams.toString();

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Customer type" className="flex items-center gap-2" data-customer-tabs>
            <Link href={tabHref(false)} aria-current={!guests ? "page" : undefined} className={tabClass(!guests)}>
              Customers
              <span className={countClass(!guests)}>{customerCount}</span>
            </Link>
            <Link href={tabHref(true)} aria-current={guests ? "page" : undefined} className={tabClass(guests)}>
              Guests
              <span className={countClass(guests)}>{guestCount}</span>
            </Link>
          </nav>
          {/* A plain link, not a form: the browser downloads it and the page
              stays where it is. Carries the current search so the file matches
              what is on screen, on either tab. */}
          {canExport ? (
            <a
              href={`/api/admin/export/customers${exportQuery ? `?${exportQuery}` : ""}`}
              data-export-link
              className="rounded-full border border-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
            >
              Export CSV
            </a>
          ) : null}
        </div>
      </div>

      {guests ? (
        <p className="mx-6 mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
          People who checked out without an account. Their records are here for reference only: they
          earn no points and nothing can be changed, until they create an account themselves with the
          same email. They then move to Customers. You can export them, or select them to email an
          invite to create an account or delete their records (their orders are kept).
        </p>
      ) : null}

      {bulk ? (
        <p
          role={bulk === "forbidden" || bulk.startsWith("reset_") || bulk.startsWith("invite_") || ((bulk === "reset" || bulk === "invite") && failedSends > 0) ? "alert" : undefined}
          className={`mx-6 mb-1 mt-4 rounded-2xl border px-4 py-3 text-sm ${
            bulk === "forbidden"
              ? "border-red-200 bg-red-50 text-red-700"
              : bulk.startsWith("reset_") || bulk.startsWith("invite_") || ((bulk === "reset" || bulk === "invite") && failedSends > 0)
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {bulk === "invite"
            ? `Emailed ${n} account invite${n === "1" ? "" : "s"}. They move to Customers once they register with the same email.${
                failedSends > 0 ? ` ${failedSends} could not be sent - check Settings → Email Configurations.` : ""
              }${unsubscribed > 0 ? ` ${unsubscribed} skipped: unsubscribed from marketing email.` : ""}`
            : bulk === "invite_mailoff"
            ? "Email is switched off, so no invites were sent. Turn it on under Settings → Email Configurations."
            : bulk === "invite_incomplete"
            ? "Email settings are incomplete, so no invites were sent. Finish them under Settings → Email Configurations."
            : bulk === "invite_toomany"
            ? `Select at most ${n} guests at a time for invites.`
            : bulk === "guest_deleted"
            ? `Deleted ${n} guest record${n === "1" ? "" : "s"}. Their orders were kept.`
            : bulk === "deleted"
            ? `Deleted ${n} customer${n === "1" ? "" : "s"}. Their orders were kept.`
            : bulk === "codes"
              ? `Issued ${n} referral code${n === "1" ? "" : "s"}.`
              : bulk === "reset"
                ? `Sent ${n} password reset email${n === "1" ? "" : "s"}. Each link works once, for 60 minutes.${
                    failedSends > 0
                      ? ` ${failedSends} could not be sent - check Settings → Email Configurations.`
                      : ""
                  }`
                : bulk === "reset_mailoff"
                  ? "Email is switched off, so no reset links were sent. Turn it on under Settings → Email Configurations."
                  : bulk === "reset_incomplete"
                    ? "Email settings are incomplete, so no reset links were sent. Finish them under Settings → Email Configurations."
                    : bulk === "reset_toomany"
                      ? `Select at most ${n} customers at a time for reset emails.`
                      : "You don't have permission to do that."}
        </p>
      ) : null}

      <form action="/admin/customers" className="flex flex-wrap items-center gap-3 px-3 lg:px-5 py-5">
        {guests ? <input type="hidden" name="view" value="guests" /> : null}
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Name or email"
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-accent)]"
          />
        </div>
        <button
          type="submit"
          className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Search
        </button>
      </form>

      {customers.length === 0 ? (
        <p className="px-6 pb-12 text-center text-sm text-slate-500">
          {q
            ? guests
              ? "No guests match that search."
              : "No customers match that search."
            : guests
              ? "No guest checkouts yet."
              : "No customers yet."}
        </p>
      ) : (
        <>
        {selectable ? (
          <form id={bulkFormId} className="px-6">
            <BulkBar
              formId={bulkFormId}
              noun={guests ? "guest" : "customer"}
              actions={guests ? [
                {
                  label: "Email invite to create account",
                  action: bulkSendGuestInvites,
                  confirm:
                    "Email each selected guest an invite to create an account?\n\nIt links to the register page; nothing changes on their record. Anyone who unsubscribed from marketing email is skipped.",
                },
                {
                  label: "Delete guests",
                  action: bulkDeleteGuests,
                  danger: true,
                  confirm:
                    "Delete the selected guest records permanently?\n\nTheir orders stay for revenue reporting. Their saved addresses go, and if they register later their old orders won't be attached to the new account.",
                },
              ] : [
                {
                  label: "Send password reset email",
                  action: bulkSendResetEmails,
                  confirm:
                    "Email a password reset link to each selected customer?\n\nEach link works once, for 60 minutes. Any reset link they were sent before stops working.",
                },
                { label: "Issue referral codes", action: bulkIssueReferralCodes },
                {
                  label: "Delete",
                  action: bulkDeleteCustomers,
                  danger: true,
                  confirm:
                    "Delete the selected customers permanently?\n\nTheir orders stay for revenue reporting — only the customer record, sign-in, saved addresses and points balance go.",
                },
              ]}
            />
          </form>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full ">
            <thead className="bg-slate-50/80">
              <tr>
                {selectable ? (
                  <th className="w-10 px-3 lg:px-5 py-3.5 text-left">
                    <BulkMaster formId={bulkFormId} label={guests ? "Select all guests" : "Select all customers"} />
                  </th>
                ) : null}
                {[guests ? "Guest" : "Customer", "Orders", "Spent", "Last order", guests ? "View" : "Action"].map((h) => (
                  <th
                    key={h}
                    className={`px-3 lg:px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                      h === "Customer" || h === "Guest" ? "text-left" : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => {
                const paid = c.orders.filter((o) =>
                  (PAID as readonly string[]).includes(o.status),
                );
                const spent = paid.reduce((n, o) => n + o.totalCents, 0);
                const last = c.orders
                  .map((o) => o.createdAt)
                  .sort((a, b) => b.getTime() - a.getTime())[0];

                return (
                  <tr key={c.id} className="hover:bg-slate-50/60" data-guest-row={guests ? "" : undefined}>
                    {selectable ? (
                      <td className="px-3 lg:px-5 py-4">
                        <BulkCheckbox
                          formId={bulkFormId}
                          id={c.id}
                          label={c.name ?? c.email}
                        />
                      </td>
                    ) : null}
                    <td className="px-3 lg:px-5 py-4">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                        {c.name ?? "—"}
                        {guests ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            Guest
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-slate-400">{c.email}</span>
                    </td>
                    <td className="px-3 lg:px-5 py-4 text-right text-sm tabular-nums text-slate-600">
                      {c.orders.length}
                    </td>
                    <td className="px-3 lg:px-5 py-4 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                      <span title={money.format(spent)}>{money.compact(spent)}</span>
                    </td>
                    <td className="px-3 lg:px-5 py-4 text-right text-sm text-slate-400">
                      {last ? ymd(last, tz) : "—"}
                    </td>
                    <td className="px-3 lg:px-5 py-4">
                      <div className="flex justify-end">
                        {guests ? (
                          <Link
                            href={`/admin/customers/${c.id}`}
                            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                          >
                            View record
                          </Link>
                        ) : (
                          <Link
                            href={`/admin/customers/${c.id}`}
                            title="Edit"
                            aria-label={`Edit ${c.name ?? c.email}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          >
                            <IconPencil className="h-[17px] w-[17px]" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Card>
  );
}
