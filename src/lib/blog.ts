import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { bodyToPlain } from "@/lib/markdown";
import { DEFAULT_TZ } from "@/lib/timezone";

export const POSTS_PER_PAGE = 9;

/**
 * What the public is allowed to see: published, and not dated in the future.
 *
 * The future check is what makes scheduling work - saving a post as published
 * with next Tuesday's date keeps it off the site until then, exactly as
 * WordPress does it, with no scheduler process to run.
 */
export function publicPostWhere(): Prisma.BlogPostWhereInput {
  return {
    status: "PUBLISHED",
    OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
  };
}

export const postCardSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  body: true,
  coverImage: true,
  publishedAt: true,
  createdAt: true,
  authorName: true,
  categories: { select: { slug: true, name: true } },
} satisfies Prisma.BlogPostSelect;

export type PostCard = Prisma.BlogPostGetPayload<{ select: typeof postCardSelect }>;

/** The stored excerpt if the author wrote one, otherwise the first prose. */
export function excerptFor(post: { excerpt: string; body: string }, limit = 160): string {
  return post.excerpt.trim() || bodyToPlain(post.body, limit);
}

export function postDate(post: { publishedAt: Date | null; createdAt: Date }): Date {
  return post.publishedAt ?? post.createdAt;
}

export function formatPostDate(date: Date, timeZone: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(date);
}

/** One page of posts, optionally narrowed to a category or tag. */
export async function listPosts(opts: {
  page?: number;
  categorySlug?: string;
  tagSlug?: string;
  search?: string;
  perPage?: number;
}): Promise<{ posts: PostCard[]; total: number; page: number; pages: number }> {
  const perPage = opts.perPage ?? POSTS_PER_PAGE;
  const page = Math.max(1, opts.page ?? 1);

  /*
   * Every condition is an AND clause. Built this way because the published
   * check is itself an OR (no date, or a date already passed) and a search
   * adds a second OR - as sibling keys one would silently replace the other,
   * and a search could surface a draft.
   */
  const where: Prisma.BlogPostWhereInput = {
    AND: [
      publicPostWhere(),
      ...(opts.categorySlug ? [{ categories: { some: { slug: opts.categorySlug } } }] : []),
      ...(opts.tagSlug ? [{ tags: { some: { slug: opts.tagSlug } } }] : []),
      ...(opts.search
        ? [
            {
              OR: [
                { title: { contains: opts.search, mode: "insensitive" as const } },
                { body: { contains: opts.search, mode: "insensitive" as const } },
                { excerpt: { contains: opts.search, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };

  const [posts, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      select: postCardSelect,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.blogPost.count({ where }),
  ]);

  return { posts, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

/** Sidebar data, fetched once per page. */
export async function blogSidebar() {
  const [categories, tags, recent] = await Promise.all([
    prisma.blogCategory.findMany({
      orderBy: { name: "asc" },
      select: {
        slug: true,
        name: true,
        _count: { select: { posts: { where: publicPostWhere() } } },
      },
    }),
    prisma.blogTag.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    prisma.blogPost.findMany({
      where: publicPostWhere(),
      select: { slug: true, title: true, coverImage: true, publishedAt: true, createdAt: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 4,
    }),
  ]);

  // A category with nothing published in it is noise in the sidebar.
  return { categories: categories.filter((c) => c._count.posts > 0), tags, recent };
}

/**
 * Approved comments for a post, arranged into WordPress-style threads.
 * One query, nested in memory - a recursive query would cost more than the
 * handful of rows a blog post attracts.
 */
export type CommentNode = {
  id: string;
  authorName: string;
  body: string;
  createdAt: Date;
  replies: CommentNode[];
};

export async function threadedComments(postId: string): Promise<CommentNode[]> {
  const rows = await prisma.blogComment.findMany({
    where: { postId, status: "APPROVED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, parentId: true, authorName: true, body: true, createdAt: true },
  });

  const byId = new Map<string, CommentNode>();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      authorName: r.authorName,
      body: r.body,
      createdAt: r.createdAt,
      replies: [],
    });
  }

  const roots: CommentNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    // A reply whose parent is unapproved is promoted to a root rather than
    // disappearing with it - the reader still sees the contribution.
    const parent = r.parentId ? byId.get(r.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

export function countComments(nodes: CommentNode[]): number {
  return nodes.reduce((n, c) => n + 1 + countComments(c.replies), 0);
}

/** Posts sharing a category, for the "read next" strip. */
export async function relatedPosts(
  postId: string,
  categorySlugs: string[],
  take = 3,
): Promise<PostCard[]> {
  if (categorySlugs.length === 0) return [];
  return prisma.blogPost.findMany({
    where: {
      ...publicPostWhere(),
      id: { not: postId },
      categories: { some: { slug: { in: categorySlugs } } },
    },
    select: postCardSelect,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take,
  });
}
