import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { Card } from "@/components/admin/ui";
import { TH, Empty } from "@/components/admin/PageCard";
import { requireCapability } from "@/lib/permissions";
import { BulkBar, BulkCheckbox, BulkMaster } from "@/components/admin/BulkBar";
import { SectionCard, Field, fieldInput, fieldSelect, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary, btnGhost } from "@/components/admin/ui";
import { getRecoveryConfig } from "@/lib/abandoned-cart";
import { getRecoveryOverview } from "@/lib/cart-recovery-stats";
import { RecoveryChart } from "@/components/admin/RecoveryChart";
import { formatDelay, listFollowUps, MERGE_FIELDS } from "@/lib/cart-follow-ups";
import { getMailConfig, missingMailFields } from "@/lib/mail";
import {
  bulkDeleteCarts,
  deleteFollowUp,
  duplicateFollowUp,
  restoreDefaults,
  runSweepNow,
  saveFollowUp,
  saveRecoverySettings,
  sendOneReminder,
  toggleFollowUp,
} from "./actions";
import { getTimeZone, ymdhm } from "@/lib/timezone";

export const metadata: Metadata = { title: "Abandoned cart" };
export const dynamic = "force-dynamic";

/** A cart with no activity for this long counts as abandoned. */
const ABANDON_AFTER_HOURS = 6;

export default async function AbandonedCartsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    bulk?: string;
    n?: string;
    saved?: string;
    error?: string;
    detail?: string;
  }>;
}) {
  const me = await requireCapability("reports");
  const tz = await getTimeZone();
  const { tab: tabParam, bulk, n, saved, error, detail } = await searchParams;
  const isOwner = me.role === "OWNER";
  const cutoff = new Date(Date.now() - ABANDON_AFTER_HOURS * 3600 * 1000);

  const [recovery, mail, carts, money, overview, followUps] = await Promise.all([
    getRecoveryConfig(),
    getMailConfig(),
    prisma.cart.findMany({
      where: {
        status: { in: ["ACTIVE", "ABANDONED"] },
        lastActivityAt: { lt: cutoff },
        itemCount: { gt: 0 },
      },
      orderBy: { lastActivityAt: "desc" },
      take: 100,
      include: { items: true },
    }),
    getMoneyFormatter(),
    getRecoveryOverview(30, tz),
    listFollowUps(),
  ]);

  const TABS: { value: string; label: string; count?: number }[] = [
    { value: "overview", label: "Overview" },
    { value: "templates", label: "Follow-up emails", count: followUps.length },
    { value: "carts", label: "Abandoned carts", count: carts.length },
    { value: "settings", label: "Settings" },
  ];
  const tab = TABS.some((t) => t.value === tabParam) ? tabParam : "overview";

  const lostValue = carts.reduce((n, c) => n + c.subtotalCents, 0);
  const mailGaps = missingMailFields(mail);
  const reachable = carts.filter((c) => c.email).length;
  const recovered = carts.filter((c) => c.recoveredAt).length;

  return (
    <div className="space-y-5">
      {saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {saved === "sent"
            ? "Reminder sent."
            : saved === "sweep"
              ? `Sweep run: ${n ?? 0} email${n === "1" ? "" : "s"} sent out of ${detail ?? 0} cart(s) considered.`
              : "Saved."}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error === "forbidden"
            ? "Only a Master can change these settings."
            : detail
              ? decodeURIComponent(detail)
              : "Something went wrong."}
        </p>
      ) : null}

      {/*
        * One screen, four jobs - the numbers, the emails, the carts and the
        * switches. Tabs are plain links with a query parameter rather than
        * client state, so a page reload after saving lands you back where you
        * were working.
        */}
      <nav className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
        {TABS.map((t) => {
          const active = tab === t.value;
          return (
            <Link
              key={t.value}
              href={`/admin/abandoned-carts?tab=${t.value}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-xl px-4 py-2 text-sm transition ${
                active
                  ? "bg-white font-semibold text-slate-900 shadow-sm"
                  : "font-medium text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label}
              {t.count !== undefined ? (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                    active ? "bg-slate-100 text-slate-600" : "bg-white text-slate-500"
                  }`}
                >
                  {t.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {tab === "overview" ? (
        <>
        {/* ---------- Overview ---------- */}
        <Card className="p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                The last {overview.days} days.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 p-4">
              <dt className="text-xs font-medium text-slate-500">Recovered revenue</dt>
              <dd className="mt-1.5 text-2xl font-semibold tabular-nums text-[#0E7C66]">
                {money.compact(overview.recoveredRevenueCents)}
              </dd>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <dt className="text-xs font-medium text-slate-500">Recovered orders</dt>
              <dd className="mt-1.5 text-2xl font-semibold tabular-nums text-[#0E7C66]">
                {overview.recoveredOrders}
              </dd>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <dt className="text-xs font-medium text-slate-500">Recoverable revenue</dt>
              <dd className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">
                {money.compact(overview.recoverableRevenueCents)}
              </dd>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <dt className="text-xs font-medium text-slate-500">Recoverable carts</dt>
              <dd className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">
                {overview.recoverableOrders}
              </dd>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <dt className="text-xs font-medium text-slate-500">Out of follow-ups</dt>
              <dd className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">
                {overview.lostOrders}
              </dd>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <dt className="text-xs font-medium text-slate-500">Recovery rate</dt>
              <dd className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">
                {overview.recoveryRate === null
                  ? "—"
                  : `${(overview.recoveryRate * 100).toFixed(1)}%`}
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            <RecoveryChart
              series={overview.series}
              format={(cents) => money.format(cents)}
              compact={(cents) => money.compact(cents)}
            />
          </div>

          <p className="mt-5 max-w-3xl border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            <strong className="font-semibold text-slate-600">Recovered</strong> is a
            cart that got a follow-up and then became a paid order, credited to
            the last email it was sent.{" "}
            <strong className="font-semibold text-slate-600">Recoverable</strong> is
            what is still in play. Once a cart has had every follow-up in the
            sequence, plus three days, it moves to{" "}
            <strong className="font-semibold text-slate-600">out of follow-ups</strong>{" "}
            and stops counting as winnable.
          </p>
        </Card>
        </>
      ) : null}

      {tab === "templates" ? (
        <>
        {/* ---------- Follow-up templates ---------- */}
        <div id="templates" className="scroll-mt-24" />
        <Card className="p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Follow-up templates</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Each one is sent once per cart, at its own delay after the cart
                goes quiet. A cart only ever gets the step that matches how long
                it has been sitting there.
              </p>
            </div>
            {isOwner ? (
              <form action={restoreDefaults}>
                <button type="submit" className={btnGhost}>Restore default templates</button>
              </form>
            ) : null}
          </div>

          {followUps.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No templates yet. The built-in single reminder is used until you add
              one &mdash; &ldquo;Restore default templates&rdquo; gives you a
              three-step sequence to edit.
            </p>
          ) : (
            <ul className="space-y-3">
              {followUps.map((t) => {
                const delay = splitDelay(t.delayMinutes);
                return (
                  <li key={t.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                          {t.name}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              t.enabled
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {t.enabled ? "on" : "off"}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate text-sm text-slate-500">{t.subject}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {isOwner ? (
                          <>
                            <form action={toggleFollowUp}>
                              <input type="hidden" name="id" value={t.id} />
                              <button type="submit" className={btnGhost}>
                                {t.enabled ? "Turn off" : "Turn on"}
                              </button>
                            </form>
                            <form action={duplicateFollowUp}>
                              <input type="hidden" name="id" value={t.id} />
                              <button type="submit" className={btnGhost}>Duplicate</button>
                            </form>
                            <form action={deleteFollowUp}>
                              <input type="hidden" name="id" value={t.id} />
                              <button
                                type="submit"
                                className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </form>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                      <div>
                        <dt className="text-xs text-slate-500">Trigger after</dt>
                        <dd className="font-medium text-slate-900">{formatDelay(t.delayMinutes)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Sent</dt>
                        <dd className="font-medium tabular-nums text-slate-900">{t.sent}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Clicked</dt>
                        <dd className="font-medium tabular-nums text-slate-900">
                          {t.sent ? `${Math.round((t.clicked / t.sent) * 100)}%` : "—"}
                          <span className="ml-1 text-xs font-normal text-slate-400">({t.clicked})</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Converted</dt>
                        <dd className="font-medium tabular-nums text-slate-900">
                          {t.sent ? `${Math.round((t.converted / t.sent) * 100)}%` : "—"}
                          <span className="ml-1 text-xs font-normal text-slate-400">({t.converted})</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Recovered</dt>
                        <dd className="font-medium tabular-nums text-[#12A184]">
                          {money.format(t.revenueCents)}
                        </dd>
                      </div>
                    </dl>

                    {isOwner ? (
                      <details className="mt-3">
                        <summary className="inline-flex w-fit items-center rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">
                          Edit this email
                        </summary>
                        <form action={saveFollowUp} className="mt-4 space-y-5 rounded-2xl bg-slate-50 p-4">
                          <input type="hidden" name="id" value={t.id} />
                          <FollowUpFields
                            idPrefix={t.id}
                            name={t.name}
                            subject={t.subject}
                            body={t.body}
                            couponCode={t.couponCode}
                            delayValue={delay.value}
                            delayUnit={delay.unit}
                            enabled={t.enabled}
                          />
                          <button type="submit" className={btnPrimary}>Save changes</button>
                        </form>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {isOwner ? (
            <details className="mt-5">
              <summary className="inline-flex w-fit items-center rounded-full bg-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">
                Create new template
              </summary>
              <form action={saveFollowUp} className="mt-4 space-y-5 rounded-2xl bg-slate-50 p-4">
                <FollowUpFields
                  idPrefix="new"
                  name=""
                  subject=""
                  body={""}
                  couponCode=""
                  delayValue={1}
                  delayUnit="days"
                  enabled
                />
                <button type="submit" className={btnPrimary}>Create template</button>
              </form>
            </details>
          ) : null}

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Fields you can drop into the subject or body
            </p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {MERGE_FIELDS.map((f) => (
                <li key={f.token} className="text-xs text-slate-600">
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-900">
                    {f.token}
                  </code>{" "}
                  {f.label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              The item list, the total, the &ldquo;Complete your purchase&rdquo;
              button and the unsubscribe line are added around your text
              automatically, so every email is complete and lawful whatever the
              template says.
            </p>
          </div>
        </Card>
        </>
      ) : null}

      {tab === "carts" ? (
        <>
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Abandoned cart</h1>
              <p className="mt-1 text-sm text-slate-500">
                Carts with items and no activity for {ABANDON_AFTER_HOURS} hours.
              </p>
            </div>
            <a
              href="/api/admin/export/abandoned-carts"
              className="shrink-0 rounded-full border border-[#0E7C66] px-4 py-2 text-sm font-semibold text-[#0E7C66] transition hover:bg-[#0E7C66]/5"
            >
              Export CSV
            </a>
          </div>
          {bulk ? (
            <p className="mx-6 mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Deleted {n} cart{n === "1" ? "" : "s"}.
            </p>
          ) : null}

          <div className="h-5" />

          {carts.length === 0 ? (
            <Empty>
              No abandoned carts. Carts start being recorded once the storefront and
              checkout are live &mdash; this screen stays empty until then.
            </Empty>
          ) : (
            <>
            <form id="bulk-carts" className="px-6">
              <BulkBar
                formId="bulk-carts"
                noun="cart"
                actions={[
                  {
                    label: "Delete",
                    action: bulkDeleteCarts,
                    danger: true,
                    confirm:
                      "Delete the selected abandoned carts permanently?\n\nThey are only a record of what someone left behind — no order or customer is affected.",
                  },
                ]}
              />
            </form>

            <div className="overflow-x-auto">
              <table className="w-full ">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="w-10 px-3 lg:px-5 py-3.5 text-left">
                      <BulkMaster formId="bulk-carts" label="Select all carts" />
                    </th>
                    <TH>Customer</TH>
                    <TH>Items</TH>
                    <TH align="right">Units</TH>
                    <TH align="right">Value</TH>
                    <TH align="right">Last activity</TH>
                    <TH align="right">Reminders</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {carts.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="px-3 lg:px-5 py-4">
                        <BulkCheckbox
                          formId="bulk-carts"
                          id={c.id}
                          label={c.email ?? "anonymous cart"}
                        />
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-sm text-slate-700">
                        {c.email ?? (
                          <span className="text-slate-400">Anonymous</span>
                        )}
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-sm text-slate-600">
                        {c.items.map((i) => i.nameSnapshot).join(", ") || "—"}
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-right text-sm tabular-nums text-slate-600">
                        {c.itemCount}
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-right text-sm font-semibold tabular-nums text-[#0E7C66]">
                        {money.format(c.subtotalCents)}
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-right text-sm text-slate-400">
                        {ymdhm(c.lastActivityAt, tz)}
                      </td>
                      <td className="px-3 lg:px-5 py-4 text-right text-sm">
                        {c.recoveredAt ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            Came back
                          </span>
                        ) : !c.email ? (
                          <span className="text-xs text-slate-400">No email</span>
                        ) : (
                          <span className="flex items-center justify-end gap-2">
                            <span className="text-xs tabular-nums text-slate-500">
                              {c.remindersSent} sent
                            </span>
                            <form action={sendOneReminder}>
                              <input type="hidden" name="cartId" value={c.id} />
                              <button
                                type="submit"
                                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-[#0E7C66] hover:text-[#0E7C66]"
                              >
                                Send now
                              </button>
                            </form>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Card>
        </>
      ) : null}

      {tab === "settings" ? (
        <>
        {/* ---------- Recovery email setup ---------- */}
        <SectionCard title="Recovery emails">
          <div
            className={`mb-6 rounded-2xl border px-4 py-3.5 text-sm ${
              recovery.enabled && mail.enabled && mailGaps.length === 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {!mail.enabled || mailGaps.length ? (
              <>
                <strong className="font-semibold">Email isn&apos;t sending yet.</strong>{" "}
                Recovery reminders need working outgoing mail
                {mailGaps.length ? <> &mdash; still missing: {mailGaps.join(", ")}</> : null}.
                Set that up on the Email page first.
              </>
            ) : recovery.enabled ? (
              <>
                <strong className="font-semibold">On.</strong> Carts idle for{" "}
                {recovery.delayMinutes >= 60
                  ? `${Math.round(recovery.delayMinutes / 60)} hour(s)`
                  : `${recovery.delayMinutes} minutes`}{" "}
                get up to {recovery.maxReminders} reminder
                {recovery.maxReminders === 1 ? "" : "s"}, {recovery.intervalHours}h apart.
                {" "}Of the {carts.length} below, {reachable} have an email address.
              </>
            ) : (
              <>
                <strong className="font-semibold">Off.</strong> Nothing is sent.
                Turn it on below once you&apos;re happy with the timing.
              </>
            )}
          </div>

          {isOwner ? (
            <form action={saveRecoverySettings} className="space-y-6">
              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={recovery.enabled}
                  className="mt-0.5 h-4 w-4 accent-[#0E7C66]"
                />
                <span className="text-sm text-slate-700">
                  Send abandoned-cart reminders
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Only to carts that have items and an email address. Every
                    message carries an unsubscribe link, and an address that opts
                    out is never written to again.
                  </span>
                </span>
              </label>

              <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-3">
                <Field label="Wait before the first email (minutes)" htmlFor="delayMinutes">
                  <input id="delayMinutes" name="delayMinutes" type="number" min={15} max={20160}
                    defaultValue={recovery.delayMinutes} className={fieldInput} />
                </Field>
                <Field label="How many reminders" htmlFor="maxReminders">
                  <input id="maxReminders" name="maxReminders" type="number" min={1} max={5}
                    defaultValue={recovery.maxReminders} className={fieldInput} />
                </Field>
                <Field label="Gap between them (hours)" htmlFor="intervalHours">
                  <input id="intervalHours" name="intervalHours" type="number" min={1} max={336}
                    defaultValue={recovery.intervalHours} className={fieldInput} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
                <Field label="Discount code to include (optional)" htmlFor="coupon">
                  <input id="coupon" name="coupon" defaultValue={recovery.coupon}
                    placeholder="COMEBACK10" className={`${fieldInput} uppercase`} />
                </Field>
                <Field label="Include it from reminder number" htmlFor="couponFrom">
                  <input id="couponFrom" name="couponFrom" type="number" min={1} max={5}
                    defaultValue={recovery.couponFrom} className={fieldInput} />
                </Field>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                Holding the code back until the second reminder is usually worth
                doing: people who were going to come back anyway return without a
                discount, and you only give margin away to those who needed the
                nudge. The code must already exist under Coupons &mdash; this only
                prints it in the email.
              </p>

              <div className="flex flex-wrap justify-end gap-2">
                <button type="submit" className={btnPrimary}>Save settings</button>
              </div>
            </form>
          ) : (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Only a Master can change these settings.
            </p>
          )}

          {isOwner && recovery.enabled ? (
            <form action={runSweepNow} className="mt-4 border-t border-slate-100 pt-5">
              <button type="submit" className={btnGhost}>Run the sweep now</button>
              <span className="ml-3 text-xs text-slate-400">
                Sends any reminders that are due right now, instead of waiting for
                the next scheduled run.
              </span>
            </form>
          ) : null}
        </SectionCard>
        </>
      ) : null}
    </div>
  );
}

/** How a delay in minutes reads back into a number and a unit for the form. */
function splitDelay(minutes: number): { value: number; unit: "minutes" | "hours" | "days" } {
  if (minutes % 1440 === 0) return { value: minutes / 1440, unit: "days" };
  if (minutes % 60 === 0) return { value: minutes / 60, unit: "hours" };
  return { value: minutes, unit: "minutes" };
}

/** The same fields whether a template is being created or edited. */
function FollowUpFields({
  idPrefix,
  name,
  subject,
  body,
  couponCode,
  delayValue,
  delayUnit,
  enabled,
}: {
  idPrefix: string;
  name: string;
  subject: string;
  body: string;
  couponCode: string;
  delayValue: number;
  delayUnit: "minutes" | "hours" | "days";
  enabled: boolean;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Template name" htmlFor={`name-${idPrefix}`}>
          <input
            id={`name-${idPrefix}`}
            name="name"
            required
            defaultValue={name}
            placeholder="Reminder after 1 day"
            className={fieldInput}
          />
        </Field>

        <Field label="Discount code for this step (optional)" htmlFor={`coupon-${idPrefix}`}>
          <input
            id={`coupon-${idPrefix}`}
            name="couponCode"
            defaultValue={couponCode}
            placeholder="COMEBACK15"
            className={fieldInput}
          />
        </Field>
      </div>

      <Field label="Email subject" htmlFor={`subject-${idPrefix}`}>
        <input
          id={`subject-${idPrefix}`}
          name="subject"
          required
          defaultValue={subject}
          placeholder="You left {{cart.product_names}} behind"
          className={fieldInput}
        />
      </Field>

      <Field label="Email body" htmlFor={`body-${idPrefix}`}>
        <textarea
          id={`body-${idPrefix}`}
          name="body"
          rows={8}
          required
          defaultValue={body}
          placeholder={"Hi {{customer.first_name}},\n\nYour cart is still waiting."}
          className={fieldTextarea}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Send this email after" htmlFor={`delayValue-${idPrefix}`}>
          <div className="flex gap-2">
            <input
              id={`delayValue-${idPrefix}`}
              name="delayValue"
              type="number"
              min={1}
              defaultValue={delayValue}
              className={fieldInput}
            />
            <select name="delayUnit" defaultValue={delayUnit} className={fieldSelect} aria-label="Unit">
              <option value="minutes">Minute(s)</option>
              <option value="hours">Hour(s)</option>
              <option value="days">Day(s)</option>
            </select>
          </div>
        </Field>

        <label className="flex items-end gap-3 pb-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={enabled}
            className="h-4 w-4 rounded border-slate-300 text-[#0E7C66] focus:ring-[#0E7C66]"
          />
          Send this step
        </label>
      </div>
    </>
  );
}
