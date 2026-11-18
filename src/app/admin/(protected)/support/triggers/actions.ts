"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string, fallback: number) => {
  const n = Number(text(fd, k));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

export async function saveTrigger(fd: FormData): Promise<void> {
  await requireCapability("support");

  const id = text(fd, "id");
  const name = text(fd, "name").slice(0, 120);
  const message = text(fd, "message").slice(0, 500);
  if (!name || !message) redirect("/admin/support/triggers?error=empty");

  /*
   * Stored as a prefix with no trailing slash, so "/shop" also covers
   * "/shop?category=x" and "/shop/anything" without the admin having to think
   * about it.
   */
  let pathPrefix = text(fd, "pathPrefix");
  if (pathPrefix && !pathPrefix.startsWith("/")) pathPrefix = `/${pathPrefix}`;
  pathPrefix = pathPrefix.replace(/\/+$/, "").slice(0, 200);

  const data = {
    name,
    message,
    pathPrefix,
    delaySeconds: Math.min(int(fd, "delaySeconds", 30), 3600),
    minCartCents: Math.round(Number(text(fd, "minCart") || "0") * 100) || 0,
    onExitIntent: fd.get("onExitIntent") === "on",
    isActive: fd.get("isActive") === "on",
    sortOrder: int(fd, "sortOrder", 0),
  };

  if (id) await prisma.chatTrigger.update({ where: { id }, data });
  else await prisma.chatTrigger.create({ data });

  revalidatePath("/admin/support/triggers");
  revalidatePath("/", "layout");
  redirect("/admin/support/triggers?saved=1");
}

export async function deleteTrigger(fd: FormData): Promise<void> {
  await requireCapability("support");
  const id = String(fd.get("id") ?? "");
  if (id) await prisma.chatTrigger.delete({ where: { id } });
  revalidatePath("/admin/support/triggers");
  revalidatePath("/", "layout");
  redirect("/admin/support/triggers?deleted=1");
}
