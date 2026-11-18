"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveBanner(fd: FormData): Promise<void> {
  await requireCapability("content");

  const id = text(fd, "id");
  const imageUrl = text(fd, "imageUrl");
  if (!imageUrl) redirect("/admin/content/hero-banners?error=image");

  const position = text(fd, "textPosition");
  const sortRaw = Number(text(fd, "sortOrder"));

  const data = {
    imageUrl,
    mobileImageUrl: text(fd, "mobileImageUrl") || null,
    alt: text(fd, "alt").slice(0, 200),
    heading: text(fd, "heading").slice(0, 160),
    subheading: text(fd, "subheading").slice(0, 300),
    ctaLabel: text(fd, "ctaLabel").slice(0, 60),
    ctaHref: text(fd, "ctaHref").slice(0, 300),
    textPosition: ["left", "center", "right"].includes(position) ? position : "left",
    isActive: fd.get("isActive") === "on",
    sortOrder: Number.isFinite(sortRaw) && sortRaw >= 0 ? Math.floor(sortRaw) : 0,
  };

  if (id) await prisma.heroBanner.update({ where: { id }, data });
  else await prisma.heroBanner.create({ data });

  revalidatePath("/admin/content/hero-banners");
  revalidatePath("/", "layout");
  redirect("/admin/content/hero-banners?saved=1");
}

export async function deleteBanner(fd: FormData): Promise<void> {
  await requireCapability("content");
  const id = String(fd.get("id") ?? "");
  if (id) await prisma.heroBanner.delete({ where: { id } });
  revalidatePath("/admin/content/hero-banners");
  revalidatePath("/", "layout");
  redirect("/admin/content/hero-banners?deleted=1");
}
