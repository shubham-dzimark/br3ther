"use server";

import { requireAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { rewrite, type RewriteResult } from "@/lib/ai-write";

/**
 * Draft an SEO title or meta description.
 *
 * Gated on catalog OR content, because the same editor sits on products,
 * product categories and blog categories - which are owned by different roles.
 * It spends the shop's API credit, so it is never open to an unauthenticated
 * request.
 */
export async function generateSeo(
  kind: "seoTitle" | "seoDescription",
  context: string,
): Promise<RewriteResult> {
  const me = await requireAdmin();
  if (!can(me.role, "catalog") && !can(me.role, "content")) {
    redirect("/admin/no-access?denied=catalog");
  }
  return rewrite(context, kind);
}
