import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { Card, btnPrimary } from "@/components/admin/ui";
import { IconSearch } from "@/components/admin/Icons";
import { BulkBar, BulkCheckbox, BulkMaster } from "@/components/admin/BulkBar";
import { mediaSrc } from "@/lib/media-src";
import { formatPostDate, postDate } from "@/lib/blog";
import type { Prisma } from "@/generated/prisma";
import { bulkDeletePosts, bulkDraftPosts, bulkPublishPosts } from "./actions";
import { SeoDot } from "@/components/admin/SeoDot";
import { seoHealth, templatePresence } from "@/lib/seo-templates";

export const metadata: Metadata = { title: "Blog" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "", label: "All" },
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Drafts" },
  { value: "SCHEDULED", label: "Scheduled" },
];

export default async function BlogAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; bulk?: string; n?: string; deleted?: string }>;
}) {
  await requireCapability("content");
  const { status, q: rawQ, bulk, n, deleted } = await searchParams;
  const q = (rawQ ?? "").trim();
  const now = new Date();

  /*
   * "Scheduled" isn't a stored status - it's a published post with a date in
   * the future, which is how the storefront decides visibility too. Keeping
   * one definition means the tab can never disagree with the site.
   */
  const statusWhere: Prisma.BlogPostWhereInput =
    status === "PUBLISHED"
      ? { status: "PUBLISHED", OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] }
      : status === "SCHEDULED"
        ? { status: "PUBLISHED", publishedAt: { gt: now } }
        : status === "DRAFT"
          ? { status: "DRAFT" }
          : {};

  const where: Prisma.BlogPostWhereInput = {
    AND: [
      statusWhere,
      ...(q
        ? [
            {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { slug: { contains: q, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };

  const [posts, pendingComments, seoTpl] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        coverImage: true,
        publishedAt: true,
        createdAt: true,
        authorName: true,
        seoTitle: true,
        seoDescription: true,
        categories: { select: { name: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.blogComment.count({ where: { status: "PENDING" } }),
    templatePresence("post"),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Blog</h1>
          <p className="mt-1 text-sm text-slate-500">
            Posts, categories and comments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/admin/blog/comments"
            className="relative rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
          >
            Comments
            {pendingComments > 0 ? (
              <span className="ml-2 rounded-full bg-[#B4802A] px-2 py-0.5 text-xs font-bold text-[#0F2E26]">
                {pendingComments}
              </span>
            ) : null}
          </Link>
          <Link
            href="/admin/blog/taxonomy"
            className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
          >
            Categories &amp; tags
          </Link>
          <Link href="/admin/blog/new" className={btnPrimary}>
            Write a post
          </Link>
        </div>
      </div>

      {bulk ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {bulk === "deleted" ? `Deleted ${n} post${n === "1" ? "" : "s"}.` : `Updated ${n} post${n === "1" ? "" : "s"}.`}
        </p>
      ) : null}
      {deleted ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Post deleted.
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <form action="/admin/blog" className="flex flex-wrap items-center gap-3 px-3 lg:px-5 py-5">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Title or slug"
              className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-accent)]"
            />
          </div>
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <button
            type="submit"
            className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-2 px-6 pb-5">
          {FILTERS.map((f) => {
            const active = (status ?? "") === f.value;
            const href = f.value
              ? `/admin/blog?status=${f.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`
              : `/admin/blog${q ? `?q=${encodeURIComponent(q)}` : ""}`;
            return (
              <Link
                key={f.label}
                href={href}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-[var(--admin-btn)] text-[var(--admin-btn-ink)]"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        {posts.length === 0 ? (
          <p className="px-6 pb-12 text-center text-sm text-slate-500">
            No posts yet. &ldquo;Write a post&rdquo; starts the first one.
          </p>
        ) : (
          <>
            <form id="bulk-posts" className="px-6">
              <BulkBar
                formId="bulk-posts"
                noun="post"
                actions={[
                  { label: "Publish", action: bulkPublishPosts },
                  { label: "Move to draft", action: bulkDraftPosts },
                  {
                    label: "Delete",
                    action: bulkDeletePosts,
                    danger: true,
                    confirm: "Delete the selected posts permanently? Their comments go too.",
                  },
                ]}
              />
            </form>

            <div className="overflow-x-auto">
              <table className="w-full ">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="w-10 px-3 lg:px-5 py-3.5 text-left">
                      <BulkMaster formId="bulk-posts" label="Select all posts" />
                    </th>
                    {["Post", "Categories", "Author", "Date", "SEO", "Comments", ""].map((h) => (
                      <th
                        key={h}
                        className={`px-3 lg:px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                          ["Comments", ""].includes(h) ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {posts.map((p) => {
                    const scheduled =
                      p.status === "PUBLISHED" && p.publishedAt && p.publishedAt > now;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60">
                        <td className="px-3 lg:px-5 py-4">
                          <BulkCheckbox formId="bulk-posts" id={p.id} label={p.title} />
                        </td>
                        <td className="px-3 lg:px-5 py-4">
                          <div className="flex items-center gap-3">
                            {p.coverImage ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={mediaSrc(p.coverImage)}
                                alt=""
                                className="h-11 w-11 shrink-0 rounded-lg object-cover"
                              />
                            ) : (
                              <span className="h-11 w-11 shrink-0 rounded-lg bg-slate-100" />
                            )}
                            <div className="min-w-0">
                              <Link
                                href={`/admin/blog/${p.id}`}
                                className="block truncate text-sm font-semibold text-slate-900 hover:text-[var(--admin-accent)]"
                              >
                                {p.title}
                              </Link>
                              <span
                                className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  scheduled
                                    ? "bg-[#E3EAF3] text-[#3355aa]"
                                    : p.status === "PUBLISHED"
                                      ? "bg-[#E2EEEA] text-[var(--admin-accent)]"
                                      : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {scheduled ? "Scheduled" : p.status === "PUBLISHED" ? "Published" : "Draft"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 lg:px-5 py-4 text-sm text-slate-600">
                          {p.categories.length
                            ? p.categories.map((c) => c.name).join(", ")
                            : <span className="text-slate-300">&mdash;</span>}
                        </td>
                        <td className="px-3 lg:px-5 py-4 text-sm text-slate-600">
                          {p.authorName ?? <span className="text-slate-300">&mdash;</span>}
                        </td>
                        <td className="px-3 lg:px-5 py-4 text-sm text-slate-500">
                          {formatPostDate(postDate(p))}
                        </td>
                        <td className="px-3 py-4 lg:px-5">
                          <SeoDot health={seoHealth(p, seoTpl)} />
                        </td>
                        <td className="px-3 lg:px-5 py-4 text-right text-sm text-slate-600">
                          {p._count.comments}
                        </td>
                        <td className="px-3 lg:px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <a
                              href={`/blog/${p.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                            >
                              View
                            </a>
                            <Link
                              href={`/admin/blog/${p.id}`}
                              className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                            >
                              Edit
                            </Link>
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
    </div>
  );
}
