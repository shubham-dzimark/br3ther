import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, landingFor, requireCapability } from "@/lib/permissions";
import { getTimeZone, ymd, ymdhm } from "@/lib/timezone";
import { Card, PageHeader, StatCard, btnGhost, btnPrimary } from "@/components/admin/ui";
import { Field, fieldInput } from "@/components/admin/Field";
import { BulkBar, BulkCheckbox, BulkMaster } from "@/components/admin/BulkBar";
import { Pagination } from "@/components/admin/Pagination";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import {
  IconCheck,
  IconMail,
  IconSearch,
} from "@/components/admin/Icons";
import { getDraft, getJob, isRunning } from "@/lib/newsletter";
import { deleteSubscribers, saveNewsletterDraft, sendNewsletter, sendNewsletterTest } from "./actions";

export const metadata: Metadata = { title: "Newsletter" };
export const dynamic = "force-dynamic";

const PER_OPTIONS = [25, 50, 100];
const FORM_ID = "newsletter-form";

const ERRORS: Record<string, string> = {
  incomplete: "Add a subject and a message first.",
  none_selected: "Tick at least one subscriber in the list, or choose “All subscribers”.",
  busy: "A send is still going out. Wait for it to finish before starting another.",
  empty: "Nobody to send to: every chosen subscriber has unsubscribed.",
  mail_disabled: "Email is turned off. Turn it on in Settings → Email first.",
  mail_incomplete: "Email isn't fully set up yet. Finish Settings → Email first.",
  test: "The test email couldn't be sent.",
};

const FILTERS = [
  { key: "", label: "All" },
  { key: "subscribed", label: "Subscribed" },
  { key: "unsubscribed", label: "Unsubscribed" },
] as const;

// Soft, stable avatar colours picked from the address, so a row keeps its colour.
const AVATARS = [
  "bg-[#D5F0E7] text-[#0E7C66]",
  "bg-[#DCE4F7] text-[#3B5BA9]",
  "bg-[#FBD9E4] text-[#B03A64]",
  "bg-[#FCEFC0] text-[#8A6A00]",
  "bg-[#FBDFC8] text-[#A5531B]",
  "bg-[#C9E5F8] text-[#1F6E9C]",
];

function avatarCls(email: string): string {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

function sourceLabel(source: string): string {
  const s = source.replace(/_/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "Unknown";
}

function Notice({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-700";
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-5 py-3.5 text-sm ${cls}`}>
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          tone === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}
      >
        {tone === "success" ? <IconCheck className="h-3 w-3" /> : <span className="text-xs font-bold">!</span>}
      </span>
      <div>{children}</div>
    </div>
  );
}

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    per?: string;
    to?: string;
    saved?: string;
    test?: string;
    sent?: string;
    deleted?: string;
    error?: string;
    detail?: string;
    n?: string;
    u?: string;
  }>;
}) {
  const me = await requireCapability("promotions");
  if (!can(me.role, "customer_pii")) {
    const to = landingFor(me.role);
    redirect(`${to}${to.includes("?") ? "&" : "?"}denied=customer_pii`);
  }
  const tz = await getTimeZone();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status === "subscribed" || sp.status === "unsubscribed" ? sp.status : "";
  const perPage = PER_OPTIONS.includes(Number(sp.per)) ? Number(sp.per) : PER_OPTIONS[0];
  const page = Math.max(1, Number(sp.page) || 1);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60_000);

  // Unsubscribed is the shared marketing suppression list, not a subscriber field.
  const allEmails = await prisma.newsletterSubscriber.findMany({ select: { email: true } });
  const suppressedList = allEmails.length
    ? (
        await prisma.emailSuppression.findMany({
          where: { email: { in: allEmails.map((s) => s.email.trim().toLowerCase()) } },
          select: { email: true },
        })
      ).map((s) => s.email)
    : [];
  const suppressed = new Set(suppressedList);

  const where = {
    ...(q ? { email: { contains: q, mode: "insensitive" as const } } : {}),
    ...(status === "subscribed" ? { NOT: { email: { in: suppressedList } } } : {}),
    ...(status === "unsubscribed" ? { email: { in: suppressedList, ...(q ? { contains: q, mode: "insensitive" as const } : {}) } } : {}),
  };

  const [total, matching, last30, subscribers, draft, job, single] = await Promise.all([
    prisma.newsletterSubscriber.count(),
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.count({ where: { createdAt: { gte: since30 } } }),
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: { id: true, email: true, source: true, couponCode: true, createdAt: true },
    }),
    getDraft(),
    getJob(),
    sp.to
      ? prisma.newsletterSubscriber.findUnique({
          where: { id: sp.to },
          select: { id: true, email: true },
        })
      : null,
  ]);

  const lastPage = Math.max(1, Math.ceil(matching / perPage));
  if (page > lastPage) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (perPage !== PER_OPTIONS[0]) params.set("per", String(perPage));
    if (lastPage > 1) params.set("page", String(lastPage));
    redirect(`/admin/newsletter${params.size ? `?${params}` : ""}#signups`);
  }
  const reachable = total - suppressed.size;
  const running = isRunning(job);
  const progress = job && job.total ? Math.round(((job.sent + job.failed.length) / job.total) * 100) : 0;
  const listHref = (over: { page?: number; status?: string; per?: number }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const st = over.status ?? status;
    if (st) params.set("status", st);
    const per = over.per ?? perPage;
    if (per !== PER_OPTIONS[0]) params.set("per", String(per));
    if (over.page && over.page > 1) params.set("page", String(over.page));
    const qs = params.toString();
    return `/admin/newsletter${qs ? `?${qs}` : ""}#signups`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Newsletter"
        subtitle="Everyone who signed up for emails, and the messages you send them."
        action={
          <a href="#compose" className={btnPrimary}>
            <IconMail className="h-4 w-4" />
            Write email
          </a>
        }
      />

      {sp.error ? (
        <Notice tone="error">
          {ERRORS[sp.error] ?? "Something went wrong."}
          {sp.error === "empty" && sp.u ? ` (${sp.u} unsubscribed)` : ""}
          {sp.detail ? <span className="mt-1 block text-xs opacity-80">{sp.detail}</span> : null}
        </Notice>
      ) : null}
      {sp.saved === "draft" ? <Notice tone="success">Draft saved.</Notice> : null}
      {sp.deleted ? (
        <Notice tone="success">
          Deleted {sp.deleted} signup{sp.deleted === "1" ? "" : "s"}.
        </Notice>
      ) : null}
      {sp.test === "ok" ? (
        <Notice tone="success">
          Test email sent to <strong>{me.email}</strong>. Check your inbox.
        </Notice>
      ) : null}
      {sp.sent === "started" ? (
        <Notice tone="success">
          Sending to {sp.n} subscriber{sp.n === "1" ? "" : "s"}
          {sp.u && sp.u !== "0" ? ` (${sp.u} unsubscribed, skipped)` : ""}. Progress shows below.
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Subscribers" value={String(total)} tone="mint" />
        <StatCard label="Can be emailed" value={String(reachable)} tone="lavender" />
        <StatCard label="Unsubscribed" value={String(suppressed.size)} tone="pink" />
        <StatCard label="New in 30 days" value={String(last30)} tone="yellow" />
      </div>

      {job ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  running ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {running ? <IconMail className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {running ? "Sending now" : "Last send"}
                </p>
                <p className="mt-0.5 font-semibold text-slate-900">{job.subject}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {running
                    ? `Started ${ymdhm(new Date(job.startedAt), tz)}`
                    : `Finished ${ymdhm(new Date(job.finishedAt ?? job.updatedAt), tz)}`}
                  {` by ${job.by}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right text-sm">
                <p className="font-semibold text-slate-900">
                  {job.sent} / {job.total} sent
                </p>
                <p className="text-xs text-slate-500">
                  {job.failed.length ? <span className="text-red-600">{job.failed.length} failed</span> : "No failures"}
                  {job.unsubscribed ? ` · ${job.unsubscribed} skipped` : ""}
                </p>
              </div>
              {running ? (
                <Link href="/admin/newsletter" className={btnGhost}>
                  Refresh
                </Link>
              ) : null}
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${job.failed.length && !running ? "bg-amber-500" : "bg-[var(--admin-accent)]"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {job.failed.length ? (
            <ul className="mt-3 space-y-1 text-xs text-red-600">
              {job.failed.slice(0, 5).map((f) => (
                <li key={f.email}>
                  {f.email}: {f.error}
                </li>
              ))}
              {job.failed.length > 5 ? <li>…and {job.failed.length - 5} more</li> : null}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <form id={FORM_ID} action={sendNewsletter} className="grid gap-6 lg:grid-cols-3">
        {/* Composer */}
        <Card className="p-6 lg:col-span-2">
          <div id="compose" className="mb-7 flex scroll-mt-24 items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Compose email</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Your draft is kept when you save, send a test or send.
              </p>
            </div>
          </div>

          <div className="space-y-7">
            <Field label="Subject" htmlFor="subject">
              <input
                id="subject"
                name="subject"
                required
                defaultValue={draft.subject}
                className={fieldInput}
                placeholder="e.g. New Cuban arrivals are in"
              />
            </Field>

            <div className="grid gap-7 sm:grid-cols-2">
              <Field
                label="Heading (optional)"
                htmlFor="heading"
                hint="Big title at the top. Uses the subject if empty."
              >
                <input id="heading" name="heading" defaultValue={draft.heading} className={fieldInput} />
              </Field>
              <Field
                label="Preview text (optional)"
                htmlFor="preheader"
                hint="The grey line inboxes show after the subject."
              >
                <input id="preheader" name="preheader" defaultValue={draft.preheader} className={fieldInput} />
              </Field>
            </div>

            <Field label="Message" htmlFor="body">
              <RichTextEditor
                name="body"
                initialHtml={draft.bodyHtml}
                placeholder="Write your email here. Headings, lists, links and images all work."
                minHeight={340}
              />
            </Field>

            <div className="rounded-2xl border border-dashed border-slate-200 p-5">
              <p className="mb-5 text-sm font-medium text-slate-700">Call-to-action button (optional)</p>
              <div className="grid gap-7 sm:grid-cols-2">
                <Field label="Button text" htmlFor="buttonLabel">
                  <input
                    id="buttonLabel"
                    name="buttonLabel"
                    defaultValue={draft.buttonLabel}
                    className={fieldInput}
                    placeholder="Shop now"
                  />
                </Field>
                <Field label="Button link" htmlFor="buttonUrl" hint="Must start with https://">
                  <input
                    id="buttonUrl"
                    name="buttonUrl"
                    type="url"
                    defaultValue={draft.buttonUrl}
                    className={fieldInput}
                    placeholder="https://br3thr.com/shop"
                  />
                </Field>
              </div>
            </div>
          </div>
        </Card>

        {/* Recipients and sending */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card className="p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Recipients</h2>
            {single ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-2xl border border-[var(--admin-accent)]/40 bg-[#0E7C66]/5 p-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase ${avatarCls(single.email)}`}
                  >
                    {single.email[0]}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{single.email}</p>
                    <p className="text-xs text-slate-500">
                      {suppressed.has(single.email.trim().toLowerCase())
                        ? "Unsubscribed – won't be sent"
                        : "Only this person"}
                    </p>
                  </div>
                </div>
                {/* Not named "ids": the list's Delete submits this form too. */}
                <input type="hidden" name="to" value={single.id} />
                <Link
                  href="/admin/newsletter#compose"
                  className="inline-block text-xs font-medium text-[var(--admin-accent)] hover:underline"
                >
                  Send to everyone instead
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-slate-300 has-[:checked]:border-[var(--admin-accent)] has-[:checked]:bg-[#0E7C66]/5">
                  <input type="radio" name="mode" value="all" defaultChecked className="mt-0.5 h-4 w-4 accent-[#0E7C66]" />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">All subscribers</span>
                    <span className="block text-xs text-slate-500">
                      {reachable} {reachable === 1 ? "person" : "people"} can be emailed
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-slate-300 has-[:checked]:border-[var(--admin-accent)] has-[:checked]:bg-[#0E7C66]/5">
                  <input type="radio" name="mode" value="selected" className="mt-0.5 h-4 w-4 accent-[#0E7C66]" />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">Selected only</span>
                    <span className="block text-xs text-slate-500">The people you tick in the list below</span>
                  </span>
                </label>
                <p className="px-1 pt-1 text-xs text-slate-500">
                  To email one person, click the mail icon next to them in the list.
                </p>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Send</h2>
            <div className="space-y-2.5">
              {running ? (
                <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  A send is going out. You can send again when it finishes.
                </p>
              ) : (
                <ConfirmSubmit
                  message={
                    single
                      ? `Send this email to ${single.email} now?`
                      : "Send this email now? It goes to the recipients you chose and can't be taken back."
                  }
                  className={`${btnPrimary} w-full justify-center py-3`}
                >
                  <IconMail className="h-4 w-4" />
                  Send email
                </ConfirmSubmit>
              )}
              <button type="submit" formAction={sendNewsletterTest} className={`${btnGhost} w-full justify-center`}>
                Send test to me
              </button>
              <button
                type="submit"
                formAction={saveNewsletterDraft}
                formNoValidate
                className={`${btnGhost} w-full justify-center`}
              >
                Save draft
              </button>
            </div>
            <ul className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
              {[
                "Uses your store's email design and logo",
                "Unsubscribe link added automatically",
                "Unsubscribed people are always skipped",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <IconCheck className="h-3.5 w-3.5 text-emerald-600" />
                  {t}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </form>

      {/* Signups */}
      <Card className="overflow-hidden">
        <div id="signups" className="flex scroll-mt-24 flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex flex-wrap items-center gap-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Signups <span className="text-sm font-normal text-slate-400">({matching})</span>
            </h2>
            <nav className="flex gap-1 rounded-full bg-slate-100 p-1">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={listHref({ status: f.key, page: 1 })}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                    status === f.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </nav>
          </div>
          <form method="get" action="/admin/newsletter" className="relative">
            {status ? <input type="hidden" name="status" value={status} /> : null}
            {perPage !== PER_OPTIONS[0] ? <input type="hidden" name="per" value={perPage} /> : null}
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by email"
              className="w-64 rounded-full border border-slate-200 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15"
            />
          </form>
        </div>

        {subscribers.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <IconMail className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-slate-700">
              {q || status ? "No signups match." : "No signups yet"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {q || status ? "Try a different search or filter." : "They'll appear here as they come in."}
            </p>
          </div>
        ) : (
          <>
            {/* Shows the ticked count, drives the select-all box and holds Delete. */}
            <div className="px-6 pt-4 empty:hidden">
              <BulkBar
                formId={FORM_ID}
                actions={[{ label: "Delete", action: deleteSubscribers, danger: true }]}
                noun="signup"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    <th className="w-12 py-3 pl-6 pr-2">
                      <BulkMaster formId={FORM_ID} />
                    </th>
                    <th className="px-4 py-3">Subscriber</th>
                    <th className="px-4 py-3">Coupon</th>
                    <th className="px-4 py-3">Signed up</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="py-3 pl-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subscribers.map((s) => {
                    const off = suppressed.has(s.email.trim().toLowerCase());
                    return (
                      <tr key={s.id} className="transition hover:bg-slate-50/70">
                        <td className="py-3.5 pl-6 pr-2">
                          <BulkCheckbox id={s.id} label={s.email} formId={FORM_ID} />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase ${avatarCls(s.email)}`}
                            >
                              {s.email[0]}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">{s.email}</p>
                              <p className="text-xs text-slate-500">via {sourceLabel(s.source)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {s.couponCode ? (
                            <span className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-1 font-mono text-xs font-medium text-slate-700">
                              {s.couponCode}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-slate-600">{ymd(s.createdAt, tz)}</td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                              off ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${off ? "bg-red-500" : "bg-emerald-500"}`} />
                            {off ? "Unsubscribed" : "Subscribed"}
                          </span>
                        </td>
                        <td className="py-3.5 pl-4 pr-6 text-right">
                          {off ? null : (
                            <Link
                              href={`/admin/newsletter?to=${s.id}#compose`}
                              title={`Email ${s.email}`}
                              aria-label={`Email ${s.email}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                            >
                              <IconMail className="h-4 w-4" />
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <Pagination
          page={page}
          perPage={perPage}
          total={matching}
          perOptions={PER_OPTIONS}
          noun={matching === 1 ? "signup" : "signups"}
          href={(n, per) => listHref({ page: n, per })}
        />
      </Card>
    </div>
  );
}
