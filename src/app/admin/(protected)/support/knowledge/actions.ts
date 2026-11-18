"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { sanitizeRichText } from "@/lib/rich-text";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveArticle(fd: FormData): Promise<void> {
  await requireCapability("support");

  const id = text(fd, "id");
  const question = text(fd, "question").slice(0, 300);
  const answer = sanitizeRichText(String(fd.get("answer") ?? ""));

  if (!question || !answer.trim()) {
    redirect("/admin/support/knowledge?error=empty");
  }

  const data = {
    question,
    answer,
    keywords: text(fd, "keywords").slice(0, 300),
    category: text(fd, "category").slice(0, 80) || null,
    isActive: fd.get("isActive") === "on",
  };

  const article = id
    ? await prisma.knowledgeArticle.update({ where: { id }, data })
    : await prisma.knowledgeArticle.create({ data });

  /*
   * When the article was written from a logged gap, close that gap off rather
   * than leaving it on the list for someone else to answer again.
   */
  const gapId = text(fd, "gapId");
  if (gapId) {
    await prisma.unansweredQuestion
      .update({ where: { id: gapId }, data: { answeredById: article.id } })
      .catch(() => undefined);
  }

  revalidatePath("/admin/support/knowledge");
  redirect(`/admin/support/knowledge?id=${article.id}&saved=1`);
}

export async function deleteArticle(fd: FormData): Promise<void> {
  await requireCapability("support");
  const id = String(fd.get("id") ?? "");
  if (id) await prisma.knowledgeArticle.delete({ where: { id } });
  revalidatePath("/admin/support/knowledge");
  redirect("/admin/support/knowledge?deleted=1");
}

/** Take a gap off the list without writing an article for it. */
export async function dismissGap(fd: FormData): Promise<void> {
  await requireCapability("support");
  const id = String(fd.get("gapId") ?? "");
  if (id) {
    await prisma.unansweredQuestion.update({
      where: { id },
      data: { dismissedAt: new Date() },
    });
  }
  revalidatePath("/admin/support/knowledge");
  redirect("/admin/support/knowledge?dismissed=1");
}
