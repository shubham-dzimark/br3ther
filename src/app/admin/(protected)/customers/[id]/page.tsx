import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability, can } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";
import { centsToInput } from "@/lib/money";
import { SectionCard, Field, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { StatusPill } from "@/components/StatusPill";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import {
  adjustCustomerPoints,
  deleteCustomer,
  deleteGuest,
  issueReferralCode,
  sendCustomerResetEmail,
  sendGuestInvite,
  setCustomerPassword,
  updateCustomer,
} from "../actions";
import { orderNo } from "@/lib/order-display";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Edit customer" };
export const dynamic = "force-dynamic";

const PAID = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

const ERRORS: Record<string, string> = {
  missing: "An email address is required.",
  duplicate: "Another customer already uses that email.",
  code_taken: "That referral code belongs to someone else.",
  points_below_zero: "That would take the points balance below zero.",
  points_too_large: "Adjust by at most 1,000,000 points at a time.",
  points_not_found: "That customer no longer exists.",
  points_zero: "Enter a number of points other than zero.",
  weak: "Passwords must be at least 10 characters.",
  guest: "This is a guest checkout record. Nothing can be changed until they create an account.",
  points_guest: "Guests can't hold points until they create an account.",
  forbidden: "You don't have permission to email customers.",
  forbidden_delete: "You don't have permission to delete customer records.",
  invite_mailoff: "Outgoing email is switched off, so the invite was not sent. Turn it on under Settings → Email.",
  invite_incomplete: "Email settings are incomplete, so the invite was not sent. Finish them under Settings → Email.",
  invite_unsubscribed: "Not sent: this address has unsubscribed from marketing email.",
};

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; detail?: string }>;
}) {
  const tz = await getTimeZone();
  const me = await requireCapability("customers");
  const [{ id }, { saved, error, detail }] = await Promise.all([params, searchParams]);

  const [customer, money] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: "desc" }, take: 10 },
        loyalty: { orderBy: { createdAt: "desc" }, take: 10 },
        _count: { select: { orders: true, reviews: true, sessions: true } },
      },
    }),
    getMoneyFormatter(),
  ]);

  if (!customer) notFound();
  // A guest checkout record: shown for reference, never edited from here.
  const isGuest = !customer.passwordHash;

  const spent = customer.orders
    .filter((o) => (PAID as readonly string[]).includes(o.status))
    .reduce((n, o) => n + o.totalCents, 0);

  const savedMessage =
    saved === "password"
      ? "Password changed — the customer has been signed out everywhere."
      : saved === "reset"
        ? "Reset link emailed. It works once and expires in an hour."
        : saved === "invite"
          ? "Invite emailed. They move to Customers once they register with this email."
          : saved === "points"
          ? "Points adjusted."
          : "Saved.";

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={isGuest ? "/admin/customers?view=guests" : "/admin/customers"}
          aria-label={isGuest ? "Back to guests" : "Back to customers"}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {customer.name ?? customer.email}
        </h1>
        {customer.passwordHash ? (
          <span className="rounded-full bg-[#E2EEEA] px-3 py-1 text-xs font-medium text-[var(--admin-accent)]">
            Has account
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
            Guest — no password set
          </span>
        )}
      </div>

      {saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {savedMessage}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error === "mailoff"
            ? "Outgoing email is switched off, so no reset link could be sent. Turn it on under Settings → Email."
            : error === "invite_mail"
              ? `The invite could not be sent. ${detail ? decodeURIComponent(detail) : ""}`
              : error === "mail"
              ? `The reset link could not be sent. ${detail ? decodeURIComponent(detail) : ""}`
              : (ERRORS[error] ?? "Something went wrong.")}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl bg-[#E2EEEA] p-5">
          <p className="text-sm font-medium text-slate-700">Orders</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{customer._count.orders}</p>
        </div>
        <div className="rounded-2xl bg-[#F5EDDA] p-5">
          <p className="text-sm font-medium text-slate-700">Spent</p>
          <p className="mt-2 text-xl font-semibold text-slate-900" title={money.format(spent)}>{money.compact(spent)}</p>
        </div>
        <div className="rounded-2xl bg-[#E3EAF3] p-5">
          <p className="text-sm font-medium text-slate-700">Points</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{customer.pointsBalance}</p>
        </div>
        <div className="rounded-2xl bg-[#E4EEDE] p-5">
          <p className="text-sm font-medium text-slate-700">Store credit</p>
          <p className="mt-2 text-xl font-semibold text-slate-900" title={money.format(customer.creditCents)}>
            {money.compact(customer.creditCents)}
          </p>
        </div>
      </div>

      {isGuest ? (
        <SectionCard title="Guest checkout — read only">
          <dl className="grid grid-cols-1 gap-x-5 gap-y-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-400">Name</dt>
              <dd className="mt-0.5 text-slate-900">{customer.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Email</dt>
              <dd className="mt-0.5 break-all text-slate-900">{customer.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Phone</dt>
              <dd className="mt-0.5 text-slate-900">{customer.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">First checkout</dt>
              <dd className="mt-0.5 text-slate-900">{ymd(customer.createdAt, tz)}</dd>
            </div>
          </dl>
          <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
            This person checked out without an account. Nothing can be changed here - no
            edits, points, referral code or password - until they create an
            account themselves with this email, by registering or through the claim link
            they are sent when they try. They then move to Customers. You can email them an
            invite to create one.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            {can(me.role, "customer_pii") ? (
              <form action={sendGuestInvite}>
                <input type="hidden" name="id" value={customer.id} />
                <button
                  type="submit"
                  data-guest-invite
                  className="rounded-full bg-[var(--admin-btn)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-btn-ink)] transition hover:brightness-110"
                >
                  Email invite to create account
                </button>
              </form>
            ) : null}
            <Link
              href={`/admin/orders?q=${encodeURIComponent(customer.email)}`}
              className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
            >
              View their orders
            </Link>
          </div>
        </SectionCard>
      ) : (
      <>
      <form action={updateCustomer}>
        <SectionCard title="Customer details">
          <input type="hidden" name="id" value={customer.id} />
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="First name" htmlFor="firstName">
              <input
                id="firstName"
                name="firstName"
                defaultValue={(customer.name ?? "").trim().split(/\s+/)[0] ?? ""}
                className={fieldInput}
              />
            </Field>
            <Field label="Last name" htmlFor="lastName">
              <input
                id="lastName"
                name="lastName"
                defaultValue={(customer.name ?? "").trim().split(/\s+/).slice(1).join(" ")}
                className={fieldInput}
              />
            </Field>
            <Field label="Email" htmlFor="email">
              <input id="email" name="email" type="email" defaultValue={customer.email} required className={fieldInput} />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <input id="phone" name="phone" defaultValue={customer.phone ?? ""} className={fieldInput} />
            </Field>
            <Field label="Store credit" htmlFor="credit">
              <input
                id="credit"
                name="credit"
                inputMode="decimal"
                defaultValue={centsToInput(customer.creditCents)}
                className={fieldInput}
              />
            </Field>
            <Field label="Referral code" htmlFor="referralCode">
              <input
                id="referralCode"
                name="referralCode"
                defaultValue={customer.referralCode ?? ""}
                placeholder="None issued"
                className={fieldInput}
              />
            </Field>
          </div>
          <div className="mt-7 flex justify-end">
            <button type="submit" className={btnPrimary}>Save details</button>
          </div>
        </SectionCard>
      </form>

      {!customer.referralCode ? (
        <form action={issueReferralCode}>
          <SectionCard title="Referral code">
            <input type="hidden" name="id" value={customer.id} />
            <p className="mb-5 text-sm text-slate-500">
              This customer has no referral code yet.
            </p>
            <button type="submit" className={btnPrimary}>Issue a code</button>
          </SectionCard>
        </form>
      ) : null}

      <form action={sendCustomerResetEmail}>
        <SectionCard title="Send a password reset">
          <input type="hidden" name="id" value={customer.id} />
          <p className="text-sm leading-relaxed text-slate-600">
            Emails <strong className="font-medium text-slate-900">{customer.email}</strong>{" "}
            a link to choose their own password. It works once, expires in an
            hour, and signs them out everywhere when they use it.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Prefer this to setting a password by hand: nobody here ever learns
            what their password is, and there is nothing to read out over the
            phone.
          </p>
          <div className="mt-6 flex justify-end">
            <button type="submit" className={btnPrimary}>Email a reset link</button>
          </div>
        </SectionCard>
      </form>

      <form action={setCustomerPassword}>
        <SectionCard title="Set a new password">
          <input type="hidden" name="id" value={customer.id} />
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="New password" htmlFor="password">
              <input
                id="password"
                name="password"
                type="password"
                minLength={10}
                required
                autoComplete="new-password"
                className={fieldInput}
              />
            </Field>
          </div>
          <p className="mt-3 px-5 text-xs text-slate-400">
            For support cases where someone can&rsquo;t get in. At least 10
            characters. Signs them out of {customer._count.sessions} active
            session{customer._count.sessions === 1 ? "" : "s"}, so tell them the
            new password.
          </p>
          <div className="mt-7 flex justify-end">
            <button type="submit" className={btnPrimary}>Change password</button>
          </div>
        </SectionCard>
      </form>

      <form action={adjustCustomerPoints}>
        <SectionCard title="Adjust loyalty points">
          <input type="hidden" name="id" value={customer.id} />
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-3">
            <Field label="Points (+ or −)" htmlFor="points">
              <input id="points" name="points" type="number" placeholder="e.g. 300 or -150" className={fieldInput} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Reason" htmlFor="note">
                <textarea id="note" name="note" rows={2} className={fieldTextarea} />
              </Field>
            </div>
          </div>
          <p className="mt-3 px-5 text-xs text-slate-400">
            Every adjustment writes an audit row, so the balance can always be
            explained.
          </p>
          <div className="mt-7 flex justify-end">
            <button type="submit" className={btnPrimary}>Apply adjustment</button>
          </div>
        </SectionCard>
      </form>

      </>
      )}

      {customer.loyalty.length > 0 ? (
        <SectionCard title="Recent points activity">
          <ul className="divide-y divide-slate-100">
            {customer.loyalty.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-slate-600">
                  {t.note ?? t.type.toLowerCase()}
                  <span className="ml-2 text-xs text-slate-400">
                    {ymd(t.createdAt, tz)}
                  </span>
                </span>
                <span className={t.points >= 0 ? "font-medium text-[var(--admin-accent)]" : "font-medium text-red-600"}>
                  {t.points >= 0 ? "+" : ""}
                  {t.points}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {customer.orders.length > 0 ? (
        <SectionCard title="Recent orders">
          <ul className="divide-y divide-slate-100">
            {customer.orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <Link href={`/admin/orders/${o.id}`} className="text-sm font-medium text-slate-900 hover:text-[var(--admin-accent)]">
                  {orderNo(o.orderNumber)}
                </Link>
                <div className="flex items-center gap-3">
                  <StatusPill status={o.status} />
                  <span className="text-sm font-semibold text-slate-900">
                    {money.formatIn(o.totalCents, o.currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {isGuest && can(me.role, "customer_pii") ? (
      <form action={deleteGuest} data-guest-delete>
        <SectionCard title="Danger zone">
          <input type="hidden" name="id" value={customer.id} />
          <ConfirmSubmit
            message={"Delete this guest record permanently?\n\nTheir orders stay for revenue reporting. Their saved addresses go, and if they register later their old orders won't be attached to the new account."}
            className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            Delete guest record
          </ConfirmSubmit>
          <p className="mt-3 text-xs text-slate-400">
            Their orders stay in the system for revenue reporting; only the guest
            record and saved addresses are removed.
          </p>
        </SectionCard>
      </form>
      ) : null}

      {isGuest ? null : (
      <form action={deleteCustomer}>
        <SectionCard title="Danger zone">
          <input type="hidden" name="id" value={customer.id} />
          <button
            type="submit"
            className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            Delete this customer
          </button>
          <p className="mt-3 text-xs text-slate-400">
            Their orders stay in the system for revenue reporting; only the
            customer record and sign-in are removed.
          </p>
        </SectionCard>
      </form>
      )}
    </div>
  );
}
