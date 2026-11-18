"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { deleteMediaAsset, storeUpload } from "@/lib/media";

/** Bulk upload into the library. Used by the Media screen and the picker. */
export async function uploadToLibrary(fd: FormData): Promise<void> {
  const me = await requireCapability("content");

  const files = fd.getAll("files").filter((f): f is File => f instanceof File);
  let added = 0;
  let rejected = 0;

  for (const file of files) {
    if (file.size === 0) continue;
    const kind = file.type.startsWith("video/") ? "video" : "image";
    const stored = await storeUpload(file, kind, me.id);
    if (stored) added += 1;
    else rejected += 1;
  }

  revalidatePath("/admin/media");
  const back = String(fd.get("back") ?? "/admin/media");
  const sep = back.includes("?") ? "&" : "?";
  redirect(`${back}${sep}uploaded=${added}${rejected ? `&rejected=${rejected}` : ""}`);
}

export async function updateMediaAlt(fd: FormData): Promise<void> {
  await requireCapability("content");
  const id = String(fd.get("id") ?? "");
  if (id) {
    await prisma.mediaAsset.update({
      where: { id },
      data: { alt: String(fd.get("alt") ?? "").trim() || null },
    });
  }
  revalidatePath("/admin/media");
  redirect("/admin/media?saved=1");
}

export async function removeMedia(fd: FormData): Promise<void> {
  await requireCapability("content");
  const id = String(fd.get("id") ?? "");
  if (id) await deleteMediaAsset(id);
  revalidatePath("/admin/media");
  redirect("/admin/media?deleted=1");
}
