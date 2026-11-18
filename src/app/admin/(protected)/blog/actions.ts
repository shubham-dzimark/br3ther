"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { slugify } from "@/lib/slug";
import { bodyToPlain } from "@/lib/markdown";
import { fromLocalInput, getTimeZone } from "@/lib/timezone";
import { sanitizeRichText } from "@/lib/rich-text";

const LIST = "/admin/blog";

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const ids = (fd: FormData) =>
  fd.getAll("ids").map((v) => String(v).trim()).filter(Boolean);

/**
 * Slugs are the post's permanent address, so a collision must never silently
 * overwrite someone else's post. A taken slug gets -2, -3 and so on, the same
 * way WordPress resolves it.
 */
async function uniquePostSlug(desired: string, exceptId?: string): Promise<string> {
  const base = slugify(desired) || "post";
  let candidate = base;
  for (let n = 2; n < 200; n++) {
    const clash = await prisma.blogPost.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash || clash.id === exceptId) return candidate;
    candidate = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

/** "tag one, tag two" -> rows, created on demand like WordPress tag input. */
async function tagIdsFor(raw: string): Promise<string[]> {
  const names = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 25);

  const out: string[] = [];
  for (const name of names) {
    const slug = slugify(name);
    if (!slug) continue;
    const tag = await prisma.blogTag.upsert({
      where: { slug },
      update: {},
      create: { slug, name },
    });
    out.push(tag.id);
  }
  return out;
}

/** Shared by create and update - the two forms post identical fields. */
async function postFields(fd: FormData, authorName: string | null) {
  const status = text(fd, "status") === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  const dateRaw = text(fd, "publishedAt");
  // Typed in the store's zone, not the server's - see fromLocalInput.
  const publishedAt = dateRaw
    ? fromLocalInput(dateRaw, await getTimeZone())
    : status === "PUBLISHED"
      ? new Date()
      : null;
  // Editor output, allowlisted server-side - never trust the client.
  const body = sanitizeRichText(String(fd.get("body") ?? ""));

  return {
    title: text(fd, "title") || "Untitled",
    body,
    // Auto-excerpt on save rather than at render time, so what the index
    // shows is visible and editable in the admin instead of being a surprise.
    excerpt: text(fd, "excerpt") || bodyToPlain(body, 200),
    coverImage: text(fd, "coverImage") || null,
    status: status as "DRAFT" | "PUBLISHED",
    publishedAt: publishedAt,
    seoTitle: text(fd, "seoTitle") || null,
    seoDescription: text(fd, "seoDescription") || null,
    commentsOpen: fd.get("commentsOpen") === "on",
    authorName,
  };
}

export async function createPost(fd: FormData): Promise<void> {
  const me = await requireCapability("content");

  const slug = await uniquePostSlug(text(fd, "slug") || text(fd, "title"));
  const categoryIds = fd.getAll("categoryIds").map(String).filter(Boolean);
  const tagIds = await tagIdsFor(text(fd, "tags"));

  const post = await prisma.blogPost.create({
    data: {
      ...(await postFields(fd, me.name)),
      slug,
      authorId: me.id,
      categories: { connect: categoryIds.map((id) => ({ id })) },
      tags: { connect: tagIds.map((id) => ({ id })) },
    },
  });

  revalidatePath(LIST);
  revalidatePath("/blog");
  redirect(`/admin/blog/${post.id}?saved=1`);
}

export async function updatePost(fd: FormData): Promise<void> {
  const me = await requireCapability("content");
  const id = text(fd, "id");
  if (!id) redirect(LIST);

  const existing = await prisma.blogPost.findUnique({
    where: { id },
    select: { slug: true, authorName: true },
  });
  if (!existing) redirect(LIST);

  const slug = await uniquePostSlug(text(fd, "slug") || text(fd, "title"), id);
  const categoryIds = fd.getAll("categoryIds").map(String).filter(Boolean);
  const tagIds = await tagIdsFor(text(fd, "tags"));

  await prisma.blogPost.update({
    where: { id },
    data: {
      // The original byline stands; editing someone else's post shouldn't
      // quietly reassign authorship to whoever last touched it.
      ...(await postFields(fd, existing.authorName ?? me.name)),
      slug,
      categories: { set: categoryIds.map((cid) => ({ id: cid })) },
      tags: { set: tagIds.map((tid) => ({ id: tid })) },
    },
  });

  revalidatePath(LIST);
  revalidatePath("/blog");
  revalidatePath(`/blog/${existing.slug}`);
  revalidatePath(`/blog/${slug}`);
  redirect(`/admin/blog/${id}?saved=1`);
}

export async function deletePost(fd: FormData): Promise<void> {
  await requireCapability("content");
  const id = text(fd, "id");
  if (id) await prisma.blogPost.delete({ where: { id } });

  revalidatePath(LIST);
  revalidatePath("/blog");
  redirect(`${LIST}?deleted=1`);
}

/* ------------------------------------------------------------ bulk actions */

async function bulkStatus(fd: FormData, status: "DRAFT" | "PUBLISHED") {
  await requireCapability("content");
  const list = ids(fd);
  if (list.length) {
    await prisma.blogPost.updateMany({
      where: { id: { in: list } },
      data: { status },
    });
    // A post published for the first time needs a date, or it would sort to
    // the bottom of the index on createdAt and read as undated.
    if (status === "PUBLISHED") {
      await prisma.blogPost.updateMany({
        where: { id: { in: list }, publishedAt: null },
        data: { publishedAt: new Date() },
      });
    }
  }
  revalidatePath(LIST);
  revalidatePath("/blog");
  redirect(`${LIST}?bulk=status&n=${list.length}`);
}

export async function bulkPublishPosts(fd: FormData): Promise<void> {
  return bulkStatus(fd, "PUBLISHED");
}

export async function bulkDraftPosts(fd: FormData): Promise<void> {
  return bulkStatus(fd, "DRAFT");
}

export async function bulkDeletePosts(fd: FormData): Promise<void> {
  await requireCapability("content");
  const list = ids(fd);
  if (list.length) await prisma.blogPost.deleteMany({ where: { id: { in: list } } });

  revalidatePath(LIST);
  revalidatePath("/blog");
  redirect(`${LIST}?bulk=deleted&n=${list.length}`);
}

/* -------------------------------------------------------------- taxonomies */

const TAX = "/admin/blog/taxonomy";

export async function saveCategory(fd: FormData): Promise<void> {
  await requireCapability("content");
  const id = text(fd, "id");
  const name = text(fd, "name");
  if (!name) redirect(`${TAX}?error=name`);

  const slug = slugify(text(fd, "slug") || name) || `category-${Date.now()}`;
  const description = text(fd, "description") || null;
  // May contain %%variables%%, expanded when the page renders.
  const seoTitle = text(fd, "seoTitle") || null;
  const seoDescription = text(fd, "seoDescription") || null;

  const clash = await prisma.blogCategory.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (clash && clash.id !== id) redirect(`${TAX}?error=slug`);

  if (id) {
    await prisma.blogCategory.update({
      where: { id },
      data: { name, slug, description, seoTitle, seoDescription },
    });
  } else {
    await prisma.blogCategory.create({
      data: { name, slug, description, seoTitle, seoDescription },
    });
  }

  revalidatePath(TAX);
  revalidatePath("/blog");
  redirect(`${TAX}?saved=1`);
}

export async function deleteCategory(fd: FormData): Promise<void> {
  await requireCapability("content");
  const id = text(fd, "id");
  // Posts keep existing; only the grouping goes.
  if (id) await prisma.blogCategory.delete({ where: { id } });

  revalidatePath(TAX);
  revalidatePath("/blog");
  redirect(TAX);
}

export async function deleteTag(fd: FormData): Promise<void> {
  await requireCapability("content");
  const id = text(fd, "id");
  if (id) await prisma.blogTag.delete({ where: { id } });

  revalidatePath(TAX);
  redirect(TAX);
}

/* ------------------------------------------------------ comment moderation */

const COMMENTS = "/admin/blog/comments";

async function setCommentStatus(fd: FormData, status: "APPROVED" | "PENDING" | "SPAM") {
  await requireCapability("content");
  const list = ids(fd);
  const single = text(fd, "id");
  const targets = list.length ? list : single ? [single] : [];

  if (targets.length) {
    await prisma.blogComment.updateMany({
      where: { id: { in: targets } },
      data: { status },
    });
  }

  revalidatePath(COMMENTS);
  revalidatePath("/blog");
  redirect(COMMENTS);
}

export async function approveComment(fd: FormData): Promise<void> {
  return setCommentStatus(fd, "APPROVED");
}

export async function unapproveComment(fd: FormData): Promise<void> {
  return setCommentStatus(fd, "PENDING");
}

export async function markCommentSpam(fd: FormData): Promise<void> {
  return setCommentStatus(fd, "SPAM");
}

export async function deleteComment(fd: FormData): Promise<void> {
  await requireCapability("content");
  const list = ids(fd);
  const single = text(fd, "id");
  const targets = list.length ? list : single ? [single] : [];
  if (targets.length) {
    await prisma.blogComment.deleteMany({ where: { id: { in: targets } } });
  }

  revalidatePath(COMMENTS);
  revalidatePath("/blog");
  redirect(COMMENTS);
}
