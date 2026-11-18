"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

import { requireCapability } from "@/lib/permissions";
import { slugify } from "@/lib/slug";
import { SYSTEM_PAGES } from "./system-pages";
import { sanitizeRichText } from "@/lib/rich-text";

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();

/** Creates the standard policy pages on first visit. */
export async function ensureSystemPages(): Promise<void> {
  // Exported from a "use server" file, so it is callable as an action on its
  // own - it must check the caller like every other action here.
  await requireCapability("content");
  for (const [i, p] of SYSTEM_PAGES.entries()) {
    await prisma.contentPage.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        title: p.title,
        isSystem: true,
        isPublished: false,
        sortOrder: i,
      },
      update: {},
    });
  }
}

export async function savePage(fd: FormData): Promise<void> {
  await requireCapability("content");
  const id = String(fd.get("id") ?? "");
  if (!id) redirect("/admin/content/pages");

  await prisma.contentPage.update({
    where: { id },
    data: {
      title: text(fd, "title") || "Untitled",
      // Editor output, allowlisted server-side - never trust the client.
      body: sanitizeRichText(String(fd.get("body") ?? "")),
      isPublished: fd.get("isPublished") === "on",
      seoTitle: text(fd, "seoTitle") || null,
      seoDescription: text(fd, "seoDescription") || null,
    },
  });

  revalidatePath("/admin/content/pages");
  redirect(`/admin/content/pages?page=${id}&saved=1`);
}

export async function createPage(fd: FormData): Promise<void> {
  await requireCapability("content");
  const title = text(fd, "title");
  if (!title) redirect("/admin/content/pages");

  let slug = slugify(text(fd, "slug") || title);
  let n = 1;
  while (await prisma.contentPage.findUnique({ where: { slug }, select: { id: true } })) {
    n += 1;
    slug = `${slugify(title)}-${n}`;
  }

  const created = await prisma.contentPage.create({
    data: { slug, title, isPublished: false },
  });

  revalidatePath("/admin/content/pages");
  redirect(`/admin/content/pages?page=${created.id}`);
}

export async function deletePage(fd: FormData): Promise<void> {
  await requireCapability("content");
  const id = String(fd.get("id") ?? "");
  if (!id) redirect("/admin/content/pages");

  const page = await prisma.contentPage.findUnique({ where: { id } });
  // System policy pages can be emptied but not removed.
  if (page && !page.isSystem) await prisma.contentPage.delete({ where: { id } });

  revalidatePath("/admin/content/pages");
  redirect("/admin/content/pages");
}
