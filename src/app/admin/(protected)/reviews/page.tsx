import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { BulkBar, BulkCheckbox, BulkMaster } from "@/components/admin/BulkBar";
import { Card } from "@/components/admin/ui";
import { Stars } from "@/components/admin/legacy/Stars";
import { IconTrash } from "@/components/admin/Icons";
import { Empty } from "@/components/admin/PageCard";
import {
  bulkApproveReviews,
  bulkDeleteReviews,
  bulkRejectReviews,
  createReview,
  deleteReview,
  updateReview,
  setReviewStatus,
} from "./actions";
import { SectionCard, Field, fieldInput, fieldSelect, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import type { ReviewStatus } from "@/generated/prisma";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Reviews" };
export const dynamic = "force-dynamic";

// "All" leads and is the default - opening on a filtered view made the page
// look empty whenever nothing was awaiting approval.
const FILTERS = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Awaiting approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
] as const;

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; saved?: string; deleted?: string; error?: string }>;
}) {
  const tz = await getTimeZone();
  await requireCapability("content");
  const sp = await searchParams;

  /*
   * Default to everything. Defaulting to PENDING meant the page opened on an
   * empty list whenever there was nothing awaiting approval, which reads as
   * "there are no reviews" rather than "none need you right now".
   */
  const status = FILTERS.some((f) => f.value === sp.status && f.value !== "")
    ? (sp.status as ReviewStatus)
    : undefined;

  const [reviews, counts, products] = await Promise.all([
    prisma.review.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { product: { select: { name: true, slug: true, id: true } } },
    }),
    prisma.review.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.product.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 500,
    }),
  ]);

  const ERRORS: Record<string, string> = {
    product: "Pick a product for the review.",
    name: "A reviewer name is required.",
    body: "The review text can't be empty.",
    rating: "Choose a rating from 1 to 5.",
    status: "That status isn't valid.",
  };
  const today = ymd(new Date(), tz);

  const countFor = (s: string) =>
    counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Reviews
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Customer reviews are held until you approve them. You can also add one
            by hand &mdash; useful for feedback that arrives by email or social.
          </p>
        </div>
        <Link
          href="/reviews"
          target="_blank"
          className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
        >
          View public page
        </Link>
      </div>

      {sp.error && ERRORS[sp.error] ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {ERRORS[sp.error]}
        </p>
      ) : null}

      {sp.saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved. Product ratings have been recalculated.
        </p>
      ) : null}
      {sp.deleted ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Review deleted.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = (status ?? "") === f.value;
          return (
            <Link
              key={f.label}
              href={`/admin/reviews?status=${f.value}`}
              className={`rounded-full px-4 py-2 text-sm transition ${
                active
                  ? "bg-[var(--admin-btn)] font-medium text-[var(--admin-btn-ink)]"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f.label}
              <span className="ml-2 text-xs opacity-70">
                {f.value
                  ? countFor(f.value)
                  : counts.reduce((n, c) => n + c._count._all, 0)}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {reviews.length === 0 ? (
            <Card className="p-12">
              <Empty>Nothing here.</Empty>
            </Card>
          ) : (
            <>
            <form id="bulk-reviews" className="mb-4">
              <BulkBar
                formId="bulk-reviews"
                noun="review"
                actions={[
                  { label: "Approve", action: bulkApproveReviews },
                  { label: "Reject", action: bulkRejectReviews },
                  { label: "Delete", action: bulkDeleteReviews, danger: true },
                ]}
              />
              <label className="flex items-center gap-2.5 px-1 text-xs font-medium text-slate-500">
                <BulkMaster formId="bulk-reviews" label="Select all reviews" />
                Select all
              </label>
            </form>

            <ul className="space-y-4">
          {reviews.map((r) => (
            <Card key={r.id} className="p-5">
              <li className="flex gap-3">
                <BulkCheckbox formId="bulk-reviews" id={r.id} label={`review by ${r.authorName}`} />
                <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Stars rating={r.rating} size={14} showCount={false} />
                      <span className="text-sm font-medium text-slate-900">
                        {r.authorName}
                      </span>
                      {r.isVerifiedPurchase ? (
                        <span className="rounded-full bg-[#E2EEEA] px-2 py-0.5 text-[11px] font-medium text-[var(--admin-accent)]">
                          Verified purchase
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          r.status === "APPROVED"
                            ? "bg-emerald-50 text-emerald-700"
                            : r.status === "REJECTED"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {r.status.toLowerCase()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {r.authorEmail} &middot;{" "}
                      {ymd(r.createdAt, tz)} &middot; on{" "}
                      <Link
                        href={`/admin/products/${r.product.id}`}
                        className="hover:text-[var(--admin-accent)]"
                      >
                        {r.product.name}
                      </Link>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {r.status !== "APPROVED" ? (
                      <form action={setReviewStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="APPROVED" />
                        <button
                          type="submit"
                          className="rounded-full bg-[var(--admin-btn)] px-4 py-1.5 text-xs font-medium text-[var(--admin-btn-ink)] transition hover:brightness-110"
                        >
                          Approve
                        </button>
                      </form>
                    ) : null}
                    {r.status !== "REJECTED" ? (
                      <form action={setReviewStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="REJECTED" />
                        <button
                          type="submit"
                          className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          Reject
                        </button>
                      </form>
                    ) : null}
                    <form action={deleteReview}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        aria-label="Delete review"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <IconTrash className="h-[17px] w-[17px]" />
                      </button>
                    </form>
                  </div>
                </div>

                {r.title ? (
                  <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                ) : null}
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {r.body}
                </p>

                {/*
                  Edit in place. A <details> rather than a modal so the row
                  needs no client JavaScript and the page keeps working before
                  hydration. The product is shown but not editable - moving a
                  review to another product would carry its rating with it.
                */}
                <details className="group mt-3">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-[var(--admin-accent)]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    <span className="group-open:hidden">Edit review</span>
                    <span className="hidden group-open:inline">Close</span>
                  </summary>

                  <form action={updateReview} className="mt-3 space-y-3 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-inset)] p-4">
                    <input type="hidden" name="id" value={r.id} />

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-600">Name</span>
                        <input name="authorName" defaultValue={r.authorName} required className={fieldInput} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-600">Email</span>
                        <input name="authorEmail" type="email" defaultValue={r.authorEmail ?? ""} className={fieldInput} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-600">Rating</span>
                        <select name="rating" defaultValue={String(r.rating)} className={fieldSelect}>
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-600">Title</span>
                      <input name="title" defaultValue={r.title ?? ""} className={fieldInput} />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-600">Review</span>
                      <textarea name="body" defaultValue={r.body} rows={4} required className={fieldTextarea} />
                    </label>

                    {/* Answered publicly, under the review on the product page.
                        Empty removes an answer that was there before. */}
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                        Your reply (shown on the product page)
                      </span>
                      <textarea name="reply" defaultValue={r.reply ?? ""} rows={3} className={fieldTextarea} />
                    </label>

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-600">Status</span>
                        <select name="status" defaultValue={r.status} className={fieldSelect}>
                          <option value="APPROVED">Approved</option>
                          <option value="PENDING">Pending</option>
                          <option value="REJECTED">Rejected</option>
                        </select>
                      </label>
                      <label className="mt-5 flex items-center gap-2.5 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          name="isVerifiedPurchase"
                          defaultChecked={r.isVerifiedPurchase}
                          className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
                        />
                        Verified purchase
                      </label>
                      <button type="submit" className={`${btnPrimary} mt-5 ml-auto`}>
                        Save review
                      </button>
                    </div>
                  </form>
                </details>
                </div>
              </li>
            </Card>
          ))}
            </ul>
            </>
          )}
        </div>

        {/* ---------- Add a review by hand ---------- */}
        <SectionCard title="Add a review">
          <form action={createReview} className="space-y-7">
            <Field label="Product" htmlFor="productId">
              <select id="productId" name="productId" required defaultValue="" className={fieldSelect}>
                <option value="" disabled>
                  Choose a product…
                </option>
                {products.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Rating" htmlFor="rating">
              <select id="rating" name="rating" defaultValue="5" className={fieldSelect}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)}
                    {"☆".repeat(5 - n)} — {n} star{n === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Customer name" htmlFor="authorName">
              <input id="authorName" name="authorName" required placeholder="Jane D." className={fieldInput} />
            </Field>

            <Field label="Email (optional)" htmlFor="authorEmail">
              <input id="authorEmail" name="authorEmail" type="email" placeholder="Not shown publicly" className={fieldInput} />
            </Field>

            <Field label="Headline (optional)" htmlFor="title">
              <input id="title" name="title" placeholder="Exactly as described" className={fieldInput} />
            </Field>

            <Field label="Review" htmlFor="body">
              <textarea id="body" name="body" rows={5} required className={fieldTextarea} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Date" htmlFor="createdAt">
                <input id="createdAt" name="createdAt" type="date" defaultValue={today} className={fieldInput} />
              </Field>
              <Field label="Status" htmlFor="status">
                <select id="status" name="status" defaultValue="APPROVED" className={fieldSelect}>
                  <option value="APPROVED">Approved (publish now)</option>
                  <option value="PENDING">Pending</option>
                </select>
              </Field>
            </div>

            <label className="flex items-center gap-3 text-sm text-slate-700">
              {/* On by default: a review added here is one the shop is
                  vouching for, and leaving it unticked meant every manually
                  entered review published without the verified mark unless
                  someone remembered to tick it. */}
              <input
                type="checkbox"
                name="isVerifiedPurchase"
                defaultChecked
                className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
              />
              Mark as a verified purchase
            </label>

            <button type="submit" className={`${btnPrimary} w-full justify-center text-center`}>
              Add review
            </button>

            <p className="text-xs text-slate-400">
              Adding an approved review republishes the product page and
              recalculates its star rating straight away.
            </p>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
