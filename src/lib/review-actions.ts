"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { notifyAdmins } from "@/lib/notifications";

/**
 * Recomputes a product's cached rating from its approved reviews. Called after
 * any moderation change so the shop's star filter stays truthful.
 */
export async function recomputeProductRating(productId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { productId, status: "APPROVED" },
    _avg: { rating: true },
    _count: { _all: true },
  });

  await prisma.product.update({
    where: { id: productId },
    data: {
      ratingAverage: agg._avg.rating ?? 0,
      ratingCount: agg._count._all,
    },
  });
}

export async function submitReview(fd: FormData): Promise<void> {
  const productId = String(fd.get("productId") ?? "");
  const slug = String(fd.get("slug") ?? "");
  const rating = Math.max(1, Math.min(5, Math.round(Number(fd.get("rating")) || 0)));
  const body = String(fd.get("body") ?? "").trim();
  const title = String(fd.get("title") ?? "").trim();

  const customer = await getCurrentCustomer();
  const authorName =
    String(fd.get("authorName") ?? "").trim() || customer?.name || "Anonymous";
  const authorEmail =
    String(fd.get("authorEmail") ?? "").trim().toLowerCase() || customer?.email || "";

  if (!productId || !slug) redirect("/shop");
  if (!rating || !body || !authorEmail) {
    redirect(`/products/${slug}?review=invalid#reviews`);
  }

  // A review counts as verified when this email has a paid order containing
  // the product.
  const purchased = await prisma.order.count({
    where: {
      email: authorEmail,
      status: { in: ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] },
      items: { some: { productId } },
    },
  });

  await prisma.review.create({
    data: {
      productId,
      customerId: customer?.id ?? null,
      authorName,
      authorEmail,
      rating,
      title: title || null,
      body,
      isVerifiedPurchase: purchased > 0,
      // Held for moderation: reviews are public content, so nothing goes live
      // on the storefront without staff approving it first.
      status: "PENDING",
    },
  });

  await notifyAdmins({
    type: "REVIEW_SUBMITTED",
    title: `New ${rating}-star review awaiting approval`,
    body: `${authorName} on ${slug}`,
    href: "/admin/reviews?status=PENDING",
  });

  revalidatePath(`/products/${slug}`);
  redirect(`/products/${slug}?review=thanks#reviews`);
}
