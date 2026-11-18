"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { setSettings, SETTING_KEYS } from "@/lib/settings";
import { requireCapability } from "@/lib/permissions";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const bool = (fd: FormData, name: string) => (fd.get(name) === "on" ? "1" : "0");
const clamp = (raw: string, min: number, max: number, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export async function saveSpinSettings(fd: FormData): Promise<void> {
  await requireCapability("settings");
  await setSettings({
    [SETTING_KEYS.spinEnabled]: bool(fd, "spinEnabled"),
    [SETTING_KEYS.spinEyebrow]: text(fd, "spinEyebrow"),
    [SETTING_KEYS.spinTitle]: text(fd, "spinTitle"),
    [SETTING_KEYS.spinSubtitle]: text(fd, "spinSubtitle"),
    [SETTING_KEYS.spinFineprint]: text(fd, "spinFineprint"),
    [SETTING_KEYS.spinDelaySeconds]: String(clamp(text(fd, "spinDelaySeconds"), 0, 120, 6)),
    [SETTING_KEYS.spinRepeatDays]: String(clamp(text(fd, "spinRepeatDays"), 0, 365, 0)),
    [SETTING_KEYS.spinEmailRequired]: bool(fd, "spinEmailRequired"),
  });
  revalidatePath("/", "layout");
  redirect("/admin/content/spin-win?saved=1");
}

export async function saveSpinPrize(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const id = text(fd, "id");
  const data = {
    label: text(fd, "label") || "Prize",
    lineOne: text(fd, "lineOne"),
    lineTwo: text(fd, "lineTwo"),
    couponCode: text(fd, "couponCode").toUpperCase(),
    weight: clamp(text(fd, "weight"), 0, 1000, 25),
    colour: /^#[0-9a-fA-F]{6}$/.test(text(fd, "colour")) ? text(fd, "colour").toUpperCase() : "#50119D",
    sortOrder: clamp(text(fd, "sortOrder"), 0, 99, 0),
    isActive: fd.get("isActive") === "on",
  };

  if (id) await prisma.spinPrize.update({ where: { id }, data });
  else await prisma.spinPrize.create({ data });

  revalidatePath("/", "layout");
  redirect("/admin/content/spin-win?saved=1");
}

export async function deleteSpinPrize(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const id = text(fd, "id");
  if (id) await prisma.spinPrize.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect("/admin/content/spin-win?saved=1");
}
