import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, btnPrimary } from "@/components/admin/ui";
import { ReplyAttachments } from "@/components/admin/ReplyAttachments";
import { chatFileUrl } from "@/lib/chat-files";
import { fieldTextarea } from "@/components/admin/Field";
import {
  bulkDeleteTickets,
  deleteTicket,
  purgeOldTickets,
  replyToTicket,
  setTicketStatus,
} from "@/app/admin/(protected)/support/actions";
import { SectionCard, Field, fieldInput } from "@/components/admin/Field";
import { BulkBar, BulkCheckbox, BulkMaster } from "@/components/admin/BulkBar";
import { btnDanger } from "@/components/admin/ui";
import { countPurgeable, supportFootprint } from "@/lib/support-cleanup";
import { requireAdmin } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma";
import { getTimeZone, ymd, ymdhm } from "@/lib/timezone";
import { ChatAutoRefresh } from "@/components/admin/ChatAutoRefresh";
import { getMoneyFormatter } from "@/lib/currency";
import { orderNo } from "@/lib/order-display";

const STATUS_TONE: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700",
  PENDING: "bg-sky-50 text-sky-700",
  RESOLVED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-slate-100 text-slate-500",
};

export async function TicketsScreen({
  back,
  title,
  blurb,
  where,
  selectedId,
  saved,
  showCleanup = false,
  purged,
  purgedCount,
  error,
}: {
  back: "inbox" | "tickets";
  title: string;
  blurb: string;
  where?: Prisma.TicketWhereInput;
  selectedId?: string;
  saved?: string;
  /** The full archive screen offers housekeeping; the Inbox deliberately doesn't. */
  showCleanup?: boolean;
  purged?: string;
  purgedCount?: string;
  error?: string;
}) {
  const me = await requireAdmin();
  const tz = await getTimeZone();
  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  const selected =
    (selectedId ? tickets.find((t) => t.id === selectedId) : undefined) ??
    tickets[0];

  const [footprint, purgeableNow] = showCleanup
    ? await Promise.all([
        supportFootprint(),
        countPurgeable({ days: 90, closedOnly: true }),
      ])
    : [null, 0];

  /*
   * Who staff are actually talking to.
   *
   * Matched by account first, falling back to the email on the thread, so a
   * guest who has ordered before is still recognised. Without this a reply
   * had to start by asking questions the shop already knew the answer to.
   */
  const contact = selected
    ? await prisma.customer.findFirst({
        where: selected.customerId
          ? { id: selected.customerId }
          : { email: selected.email },
        select: {
          id: true,
          name: true,
          email: true,
          pointsBalance: true,
          createdAt: true,
        },
      })
    : null;

  const [contactOrders, liveCart, money] = selected
    ? await Promise.all([
        prisma.order.findMany({
          where: contact
            ? { OR: [{ customerId: contact.id }, { email: selected.email }] }
            : { email: selected.email },
          orderBy: { createdAt: "desc" },
          take: 4,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalCents: true,
            currency: true,
            createdAt: true,
          },
        }),
        contact
          ? prisma.cart.findFirst({
              where: { customerId: contact.id, status: "ACTIVE", itemCount: { gt: 0 } },
              orderBy: { lastActivityAt: "desc" },
              select: { itemCount: true, subtotalCents: true, lastActivityAt: true },
            })
          : Promise.resolve(null),
        getMoneyFormatter(),
      ])
    : [[], null, null];

  /*
   * Mark the thread read so the customer's widget can show a double tick.
   *
   * Only when it was explicitly opened - `selected` also falls back to the
   * first ticket, so stamping that would mark the newest chat read merely
   * because someone had the Inbox on screen. A read receipt should under-claim
   * rather than over-claim.
   */
  if (selected && selectedId === selected.id) {
    const newest = selected.messages.at(-1)?.createdAt;
    if (newest && (!selected.staffReadAt || selected.staffReadAt < newest)) {
      await prisma.ticket.update({
        where: { id: selected.id },
        data: { staffReadAt: new Date() },
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{blurb}</p>
        </div>
        <ChatAutoRefresh />
      </div>

      {purged ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Deleted {purgedCount ?? "0"} conversation
          {purgedCount === "1" ? "" : "s"}. Their messages went with them.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error === "forbidden"
            ? "Only a Master can delete conversations in bulk."
            : "That isn't a valid number of days."}
        </p>
      ) : null}

      {showCleanup && footprint ? (
        <SectionCard title="Housekeeping">
          <p className="mb-5 rounded-2xl bg-slate-50 px-4 py-3.5 text-sm text-slate-600">
            Holding <strong className="font-semibold">{footprint.tickets}</strong>{" "}
            conversation{footprint.tickets === 1 ? "" : "s"} and{" "}
            <strong className="font-semibold">{footprint.messages}</strong> message
            {footprint.messages === 1 ? "" : "s"}, of which {footprint.closed} are
            resolved or closed.
            {purgeableNow > 0 ? (
              <>
                {" "}
                {purgeableNow} have been closed and untouched for over 90 days.
              </>
            ) : null}
          </p>

          {me.role === "OWNER" ? (
            <>
              <form action={purgeOldTickets} className="flex flex-wrap items-end gap-3">
                <Field label="Delete conversations older than (days)" htmlFor="days" className="w-64">
                  <input
                    id="days"
                    name="days"
                    type="number"
                    min={0}
                    max={3650}
                    defaultValue={90}
                    className={fieldInput}
                  />
                </Field>
                <label className="flex items-center gap-2 pb-3 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    name="closedOnly"
                    defaultChecked
                    className="h-4 w-4 accent-[var(--admin-accent)]"
                  />
                  Only resolved and closed
                </label>
                <button
                  type="submit"
                  className={btnDanger}
                  formNoValidate
                >
                  Delete them
                </button>
              </form>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Age is counted from the last message, not from when the thread
                started &mdash; a conversation someone replied to yesterday is
                never treated as old. Deleting removes the messages too and
                cannot be undone. Orders and customer accounts are not affected.
                Leaving &ldquo;only resolved and closed&rdquo; ticked is the safe
                choice: it never touches a conversation still waiting on a reply.
              </p>

              {/*
                No auto-delete control here on purpose. Retention would need a
                scheduled job on the server to mean anything, and a settings
                field that silently does nothing is worse than no field at all.
                Clearing out is a deliberate act from the button above.
              */}
            </>
          ) : (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Only a Master can delete conversations.
            </p>
          )}
        </SectionCard>
      ) : null}

      {tickets.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-sm text-slate-500">
            No messages yet. Tickets appear here once customers can contact you
            from the storefront.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="h-fit space-y-3">
            {/*
              The form holds no rows itself - the checkboxes below are tied to
              it by `form={...}`, which is what lets them sit inside the list
              while still being submitted together.
            */}
            <form id="bulk-tickets">
              <input type="hidden" name="back" value={back} form="bulk-tickets" />
              <BulkBar
                formId="bulk-tickets"
                noun="conversation"
                actions={[
                  {
                    label: "Delete",
                    action: bulkDeleteTickets,
                    danger: true,
                    confirm:
                      "Delete the selected conversations permanently?\n\nTheir messages go too. Orders and customer accounts are not affected.",
                  },
                ]}
              />
            </form>

            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
                <BulkMaster formId="bulk-tickets" label="Select all conversations" />
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Select all
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {tickets.map((t) => (
                  <li
                    key={t.id}
                    className={`flex items-center gap-3 transition ${
                      selected?.id === t.id ? "bg-[#E2EEEA]/40" : "hover:bg-slate-50"
                    }`}
                  >
                    {/* Outside the Link on purpose: a checkbox inside an
                        anchor would navigate instead of ticking. */}
                    <span className="pl-5">
                      <BulkCheckbox
                        formId="bulk-tickets"
                        id={t.id}
                        label={`${t.reference} from ${t.email}`}
                      />
                    </span>
                    <Link
                      href={`/admin/support/${back}?ticket=${t.id}`}
                      className="min-w-0 flex-1 py-4 pr-5"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">
                          {t.subject}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                            STATUS_TONE[t.status] ?? "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {t.status.toLowerCase()}
                        </span>
                      </div>
                      <p className="truncate text-xs text-slate-400">
                        {t.reference} · {t.email}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {selected ? (
            <div className="space-y-5 lg:col-span-2">
              <Card className="p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {selected.subject}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {selected.reference} · {selected.name ?? "Customer"} ·{" "}
                      {selected.email}
                    </p>
                  </div>
                  {saved ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                      Saved
                    </span>
                  ) : null}
                </div>

                {/* Who they are, before the first reply rather than after
                    three rounds of questions. */}
                <div className="mb-5 flex flex-wrap gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs">
                  <span
                    className={`rounded-full px-2.5 py-1 font-medium ${
                      contact
                        ? "bg-[#E2EEEA] text-[var(--admin-accent)]"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {contact ? "Has an account" : "Guest"}
                  </span>
                  {contact ? (
                    <>
                      <span className="rounded-full bg-white px-2.5 py-1 text-slate-600">
                        Customer since {ymd(contact.createdAt, tz)}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-slate-600">
                        {contact.pointsBalance} point
                        {contact.pointsBalance === 1 ? "" : "s"}
                      </span>
                    </>
                  ) : null}
                  <span className="rounded-full bg-white px-2.5 py-1 text-slate-600">
                    {contactOrders.length === 0
                      ? "No orders"
                      : `${contactOrders.length} recent order${contactOrders.length === 1 ? "" : "s"}`}
                  </span>
                  {liveCart && money ? (
                    <span className="rounded-full bg-[#F5EDDA] px-2.5 py-1 font-medium text-amber-800">
                      Cart: {liveCart.itemCount} item
                      {liveCart.itemCount === 1 ? "" : "s"},{" "}
                      {money.format(liveCart.subtotalCents)}
                    </span>
                  ) : null}
                  {selected.escalatedAt ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                      Waiting for a person
                    </span>
                  ) : null}
                </div>

                {contactOrders.length > 0 && money ? (
                  <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200">
                    <p className="border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Recent orders
                    </p>
                    <ul className="divide-y divide-slate-100">
                      {contactOrders.map((o) => (
                        <li key={o.id}>
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className="flex items-center justify-between gap-3 px-4 py-2 text-sm transition hover:bg-slate-50"
                          >
                            <span className="font-medium text-slate-800">
                              {orderNo(o.orderNumber)}
                            </span>
                            <span className="text-xs text-slate-500">
                              {o.status.replace(/_/g, " ").toLowerCase()}
                            </span>
                            <span className="text-xs text-slate-400">
                              {ymd(o.createdAt, tz)}
                            </span>
                            <span className="font-semibold tabular-nums text-[var(--admin-accent)]">
                              {money.formatIn(o.totalCents, o.currency)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <ul className="space-y-3">
                  {selected.messages.map((m) => (
                    <li
                      key={m.id}
                      className={`rounded-2xl px-4 py-3 text-sm ${
                        m.fromAi
                          ? "ml-8 bg-[#E3EAF3] text-slate-800"
                          : m.fromStaff
                            ? "ml-8 bg-[#E2EEEA] text-slate-800"
                            : "mr-8 bg-slate-50 text-slate-700"
                      }`}
                    >
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">
                        {m.fromAi
                          ? "Alexa \u2013 Agent"
                          : m.fromStaff
                            ? "Staff"
                            : "Customer"}{" "}
                        · {ymdhm(m.createdAt, tz)}
                      </p>
                      {m.body ? <p className="whitespace-pre-wrap">{m.body}</p> : null}
                      {m.attachments.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {m.attachments.map((a) => (
                            <a key={a} href={chatFileUrl(a)} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={chatFileUrl(a)}
                                alt="Attached image"
                                className="h-32 max-w-[12rem] rounded-xl border border-white object-cover shadow-sm"
                              />
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-6">
                <form action={replyToTicket} className="space-y-4">
                  <input type="hidden" name="ticketId" value={selected.id} />
                  <input type="hidden" name="back" value={back} />
                  <label htmlFor="body" className="block text-sm font-medium text-slate-700">
                    Reply
                  </label>
                  <textarea id="body" name="body" rows={5} className={fieldTextarea} placeholder="Type a reply, or paste a screenshot…" />
                  <ReplyAttachments textareaId="body" />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button type="submit" className={btnPrimary}>
                      Send reply
                    </button>
                  </div>
                </form>

                <form action={setTicketStatus} className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5">
                  <input type="hidden" name="ticketId" value={selected.id} />
                  <input type="hidden" name="back" value={back} />
                  <span className="mr-1 text-sm text-slate-500">Set status:</span>
                  {["OPEN", "PENDING", "RESOLVED", "CLOSED"].map((s) => (
                    <button
                      key={s}
                      type="submit"
                      name="status"
                      value={s}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                        selected.status === s
                          ? "bg-[var(--admin-btn)] text-[var(--admin-btn-ink)]"
                          : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {s.toLowerCase()}
                    </button>
                  ))}
                </form>

                <form
                  action={deleteTicket}
                  className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"
                >
                  <input type="hidden" name="ticketId" value={selected.id} />
                  <input type="hidden" name="back" value={back} />
                  <span className="text-xs text-slate-400">
                    Deleting removes this conversation and its messages for good.
                  </span>
                  <button type="submit" className={btnDanger}>
                    Delete conversation
                  </button>
                </form>
              </Card>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
