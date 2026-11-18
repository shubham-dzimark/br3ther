import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability, can } from "@/lib/permissions";
import { Card } from "@/components/admin/ui";
import { BulkBar, BulkCheckbox, BulkMaster } from "@/components/admin/BulkBar";
import { relativeDate } from "@/lib/order-display";
import type { CommentStatus } from "@/generated/prisma";
import {
  approveComment,
  deleteComment,
  markCommentSpam,
  unapproveComment,
} from "../actions";
import { getTimeZone } from "@/lib/timezone";

export const metadata: Metadata = { title: "Blog comments" };
export const dynamic = "force-dynamic";

const TABS: { value: string; label: string; status?: CommentStatus }[] = [
  { value: "PENDING", label: "Pending", status: "PENDING" },
  { value: "APPROVED", label: "Approved", status: "APPROVED" },
  { value: "SPAM", label: "Spam", status: "SPAM" },
  { value: "ALL", label: "All" },
];

export default async function BlogCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await requireCapability("content");
  const tz = await getTimeZone();
  const seePii = can(me.role, "customer_pii");
  const { tab } = await searchParams;
  const active = TABS.find((t) => t.value === tab) ?? TABS[0];

  const [comments, counts] = await Promise.all([
    prisma.blogComment.findMany({
      where: active.status ? { status: active.status } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { post: { select: { slug: true, title: true } } },
    }),
    prisma.blogComment.groupBy({ by: ["status"], _count: true }),
  ]);

  const countFor = (s?: CommentStatus) =>
    s ? (counts.find((c) => c.status === s)?._count ?? 0) : counts.reduce((n, c) => n + c._count, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/blog"
          aria-label="Back to blog"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Comments</h1>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-2 px-6 py-5">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/admin/blog/comments?tab=${t.value}`}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                active.value === t.value
                  ? "bg-[var(--admin-btn)] text-[var(--admin-btn-ink)]"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
              <span className={active.value === t.value ? "ml-1.5 opacity-80" : "ml-1.5 text-slate-400"}>
                {countFor(t.status)}
              </span>
            </Link>
          ))}
        </div>

        {comments.length === 0 ? (
          <p className="px-6 pb-12 text-center text-sm text-slate-500">
            Nothing here.
          </p>
        ) : (
          <>
            <form id="bulk-comments" className="px-6">
              <BulkBar
                formId="bulk-comments"
                noun="comment"
                actions={[
                  { label: "Approve", action: approveComment },
                  { label: "Unapprove", action: unapproveComment },
                  { label: "Mark as spam", action: markCommentSpam },
                  {
                    label: "Delete",
                    action: deleteComment,
                    danger: true,
                    confirm: "Delete the selected comments permanently? Replies to them go too.",
                  },
                ]}
              />
            </form>

            <div className="px-6 pb-6">
              <div className="mb-2 flex items-center gap-3 border-b border-slate-100 pb-3 pt-1">
                <BulkMaster formId="bulk-comments" label="Select all comments" />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Select all
                </span>
              </div>

              <ul className="divide-y divide-slate-100">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-3 py-4">
                    <div className="pt-1">
                      <BulkCheckbox formId="bulk-comments" id={c.id} label={c.authorName} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-slate-900">
                          {c.authorName}
                        </span>
                        {seePii ? (
                          <span className="text-xs text-slate-400">{c.authorEmail}</span>
                        ) : null}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            c.status === "APPROVED"
                              ? "bg-[#E2EEEA] text-[var(--admin-accent)]"
                              : c.status === "SPAM"
                                ? "bg-red-100 text-red-700"
                                : "bg-[#F5EDDA] text-[#8a6d1f]"
                          }`}
                        >
                          {c.status === "APPROVED" ? "Approved" : c.status === "SPAM" ? "Spam" : "Pending"}
                        </span>
                        <span className="text-xs text-slate-400">
                          {relativeDate(c.createdAt, new Date(), tz)}
                        </span>
                      </div>

                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                        {c.body}
                      </p>

                      <p className="mt-2 text-xs text-slate-400">
                        on{" "}
                        <Link
                          href={`/blog/${c.post.slug}`}
                          className="text-[var(--admin-accent)] hover:underline"
                        >
                          {c.post.title}
                        </Link>
                        {c.parentId ? " · a reply" : ""}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {c.status !== "APPROVED" ? (
                          <form action={approveComment}>
                            <input type="hidden" name="id" value={c.id} />
                            <button
                              type="submit"
                              className="rounded-full border border-[var(--admin-accent)] px-3.5 py-1.5 text-xs font-semibold text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
                            >
                              Approve
                            </button>
                          </form>
                        ) : (
                          <form action={unapproveComment}>
                            <input type="hidden" name="id" value={c.id} />
                            <button
                              type="submit"
                              className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                            >
                              Unapprove
                            </button>
                          </form>
                        )}
                        {c.status !== "SPAM" ? (
                          <form action={markCommentSpam}>
                            <input type="hidden" name="id" value={c.id} />
                            <button
                              type="submit"
                              className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                            >
                              Spam
                            </button>
                          </form>
                        ) : null}
                        <form action={deleteComment}>
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            type="submit"
                            className="rounded-full border border-red-200 px-3.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
