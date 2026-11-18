import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { PostEditor } from "@/components/admin/PostEditor";
import { SectionCard } from "@/components/admin/Field";
import { deletePost, updatePost } from "../actions";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getTimeZone, toLocalInput } from "@/lib/timezone";

export const metadata: Metadata = { title: "Edit post" };
export const dynamic = "force-dynamic";

/** datetime-local wants "YYYY-MM-DDTHH:mm" of the store's wall clock. */
function forDatetimeInput(d: Date | null, tz: string): string | undefined {
  return d ? toLocalInput(d, tz) : undefined;
}

export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("content");
  const tz = await getTimeZone();
  const storeName =
    (await getSettings())[SETTING_KEYS.storeName] || "Br3thr";
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);

  const [post, categories] = await Promise.all([
    prisma.blogPost.findUnique({
      where: { id },
      include: {
        categories: { select: { id: true } },
        tags: { select: { name: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.blogCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!post) notFound();

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
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight text-slate-900">
          {post.title}
        </h1>
        <a
          href={`/blog/${post.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
        >
          View post
        </a>
      </div>

      {saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </p>
      ) : null}

      <PostEditor
        key={post.id}
        storeName={storeName}
        action={updatePost}
        categories={categories}
        submitLabel="Update post"
        values={{
          id: post.id,
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          body: post.body,
          coverImage: post.coverImage ?? undefined,
          status: post.status,
          publishedAt: forDatetimeInput(post.publishedAt, tz),
          seoTitle: post.seoTitle ?? undefined,
          seoDescription: post.seoDescription ?? undefined,
          commentsOpen: post.commentsOpen,
          categoryIds: post.categories.map((c) => c.id),
          tags: post.tags.map((t) => t.name).join(", "),
        }}
      />

      <form action={deletePost}>
        <SectionCard title="Danger zone">
          <input type="hidden" name="id" value={post.id} />
          <button
            type="submit"
            className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            Delete this post
          </button>
          <p className="mt-3 text-xs text-slate-400">
            Permanent, and takes its {post._count.comments} comment
            {post._count.comments === 1 ? "" : "s"} with it.
          </p>
        </SectionCard>
      </form>
    </div>
  );
}
