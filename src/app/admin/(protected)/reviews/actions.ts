"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { recomputeProductRating } from "@/lib/review-actions";
import type { ReviewStatus } from "@/generated/prisma";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export async function setReviewStatus(fd: FormData): Promise<void> {
  await requireCapability("content");

  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!id || !(STATUSES as readonly string[]).includes(status)) {
    redirect("/admin/reviews");
  }

  const review = await prisma.review.update({
    where: { id },
    data: { status: status as ReviewStatus },
    select: { productId: true },
  });

  // The shop's star filter reads a cached average, so refresh it whenever a
  // review's visibility changes.
  await recomputeProductRating(review.productId);

  revalidatePath("/admin/reviews");
  revalidatePath("/");
  redirect("/admin/reviews?saved=1");
}

export async function deleteReview(fd: FormData): Promise<void> {
  await requireCapability("content");
  const id = String(fd.get("id") ?? "");
  if (!id) redirect("/admin/reviews");

  const review = await prisma.review.findUnique({
    where: { id },
    select: { productId: true },
  });
  if (review) {
    await prisma.review.delete({ where: { id } });
    await recomputeProductRating(review.productId);
  }

  revalidatePath("/admin/reviews");
  redirect("/admin/reviews?deleted=1");
}

/**
 * Add a review by hand.
 *
 * Staff need this for reviews that arrive by email, on social, or as part of
 * seeding a new shop. Written straight to APPROVED by default, since someone
 * with content rights is already the approver - but the status is selectable
 * so a draft can be parked as pending.
 */
/**
 * Edit an existing review in place.
 *
 * Until now a review could only be approved, rejected or deleted - a typo in
 * the body, or a rating entered as 3 when the customer meant 5, meant deleting
 * it and retyping the whole thing, which also lost its original date.
 *
 * The product it belongs to is NOT editable: moving a review between products
 * would carry its rating onto a product that never earned it. Rating changes
 * recompute the product's average, exactly as create and delete do.
 */
export async function updateReview(fd: FormData): Promise<void> {
  await requireCapability("content");

  const id = String(fd.get("id") ?? "").trim();
  if (!id) redirect("/admin/reviews");

  const existing = await prisma.review.findUnique({
    where: { id },
    select: { productId: true },
  });
  if (!existing) redirect("/admin/reviews?error=missing");

  const authorName = String(fd.get("authorName") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  const rating = Math.round(Number(fd.get("rating")) || 0);
  const title = String(fd.get("title") ?? "").trim();
  const email = String(fd.get("authorEmail") ?? "").trim();
  const status = String(fd.get("status") ?? "APPROVED");
  const verified = fd.get("isVerifiedPurchase") === "on";
  const reply = String(fd.get("reply") ?? "").trim();

  if (!authorName) redirect(`/admin/reviews?edit=${id}&error=name`);
  if (!body) redirect(`/admin/reviews?edit=${id}&error=body`);
  if (rating < 1 || rating > 5) redirect(`/admin/reviews?edit=${id}&error=rating`);
  if (!(STATUSES as readonly string[]).includes(status)) {
    redirect(`/admin/reviews?edit=${id}&error=status`);
  }

  await prisma.review.update({
    where: { id },
    data: {
      authorName,
      authorEmail: email,
      rating,
      title: title || null,
      body,
      status: status as (typeof STATUSES)[number],
      isVerifiedPurchase: verified,
      reply: reply || null,
      /* Stamped when the answer is first written, so the product page can date
         it; clearing the text clears the date with it. */
      repliedAt: reply ? new Date() : null,
    },
  });

  await recomputeProductRating(existing.productId);

  revalidatePath("/admin/reviews");
  revalidatePath("/");
  redirect("/admin/reviews?saved=1");
}

export async function createReview(fd: FormData): Promise<void> {
  await requireCapability("content");

  const productId = String(fd.get("productId") ?? "").trim();
  const authorName = String(fd.get("authorName") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  const rating = Math.round(Number(fd.get("rating")) || 0);
  const title = String(fd.get("title") ?? "").trim();
  const email = String(fd.get("authorEmail") ?? "").trim();
  const status = String(fd.get("status") ?? "APPROVED");
  const verified = fd.get("isVerifiedPurchase") === "on";
  const reply = String(fd.get("reply") ?? "").trim();
  const dateRaw = String(fd.get("createdAt") ?? "").trim();

  if (!productId) redirect("/admin/reviews?error=product");
  if (!authorName) redirect("/admin/reviews?error=name");
  if (!body) redirect("/admin/reviews?error=body");
  if (rating < 1 || rating > 5) redirect("/admin/reviews?error=rating");
  if (!(STATUSES as readonly string[]).includes(status)) {
    redirect("/admin/reviews?error=status");
  }

  // A product that no longer exists would orphan the review and break the
  // rating recompute.
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) redirect("/admin/reviews?error=product");

  await prisma.review.create({
    data: {
      productId,
      authorName,
      // Email is only used to spot duplicates internally; a hand-entered
      // review often has none, so it is not required.
      authorEmail: email,
      rating,
      title: title || null,
      body,
      status: status as ReviewStatus,
      isVerifiedPurchase: verified,
      // Lets staff backdate a review that arrived weeks ago.
      ...(/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
        ? { createdAt: new Date(`${dateRaw}T12:00:00.000Z`) }
        : {}),
    },
  });

  await recomputeProductRating(productId);

  revalidatePath("/admin/reviews");
  revalidatePath("/reviews");
  revalidatePath("/", "layout");
  redirect("/admin/reviews?saved=1");
}

function bulkIds(fd: FormData): string[] {
  return fd.getAll("ids").map((v) => String(v).trim()).filter(Boolean);
}

/**
 * Bulk approve / reject / delete. Every affected product's cached rating is
 * recomputed afterwards - the shop's star filter reads that cache, so skipping
 * it would leave averages counting reviews that are no longer visible.
 */
async function applyBulk(
  fd: FormData,
  apply: (ids: string[]) => Promise<unknown>,
  outcome: string,
): Promise<void> {
  await requireCapability("content");
  const ids = bulkIds(fd);
  if (!ids.length) redirect("/admin/reviews");

  const affected = await prisma.review.findMany({
    where: { id: { in: ids } },
    select: { productId: true },
  });

  await apply(ids);

  const productIds = Array.from(new Set(affected.map((r) => r.productId)));
  for (const pid of productIds) await recomputeProductRating(pid);

  revalidatePath("/admin/reviews");
  revalidatePath("/");
  redirect(`/admin/reviews?bulk=${outcome}&n=${ids.length}`);
}

export async function bulkApproveReviews(fd: FormData): Promise<void> {
  return applyBulk(
    fd,
    (ids) =>
      prisma.review.updateMany({
        where: { id: { in: ids } },
        data: { status: "APPROVED" as ReviewStatus },
      }),
    "approved",
  );
}

export async function bulkRejectReviews(fd: FormData): Promise<void> {
  return applyBulk(
    fd,
    (ids) =>
      prisma.review.updateMany({
        where: { id: { in: ids } },
        data: { status: "REJECTED" as ReviewStatus },
      }),
    "rejected",
  );
}

export async function bulkDeleteReviews(fd: FormData): Promise<void> {
  return applyBulk(
    fd,
    (ids) => prisma.review.deleteMany({ where: { id: { in: ids } } }),
    "deleted",
  );
}
