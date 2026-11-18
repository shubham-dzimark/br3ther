"use server";

import { requireCapability } from "@/lib/permissions";
import { rewrite, type RewriteMode, type RewriteResult } from "@/lib/ai-write";

/**
 * Rewrite a passage from the product editor.
 *
 * Gated on "catalog" like every other product action - this spends the shop's
 * API credit, so it is not something an unauthenticated request may trigger.
 */
export async function rewriteText(
  text: string,
  mode: RewriteMode,
): Promise<RewriteResult> {
  await requireCapability("catalog");
  return rewrite(text, mode);
}
