"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { setSettings, SETTING_KEYS } from "@/lib/settings";
import { sanitizeFamily } from "@/lib/fonts";

const PAGE = "/admin/settings/fonts";

export async function saveFontChoice(fd: FormData): Promise<void> {
  await requireCapability("appearance");

  await setSettings({
    [SETTING_KEYS.bodyFont]: sanitizeFamily(String(fd.get("bodyFont") ?? "")),
    [SETTING_KEYS.headingFont]: sanitizeFamily(String(fd.get("headingFont") ?? "")),
  });

  revalidatePath(PAGE);
  revalidatePath("/", "layout");
  redirect(`${PAGE}?saved=1`);
}

export async function deleteFontFile(fd: FormData): Promise<void> {
  await requireCapability("appearance");
  const id = String(fd.get("id") ?? "");
  if (!id) redirect(PAGE);

  const font = await prisma.customFont.findUnique({ where: { id } });
  if (font) {
    await prisma.customFont.delete({ where: { id } });

    // Take the file with the record; an orphaned font in /uploads is dead
    // weight in every backup from here on.
    if (font.url.startsWith("/uploads/fonts/")) {
      await rm(path.join(process.cwd(), "public", font.url), { force: true });
    }

    /*
     * Removing the last file of a family leaves the setting pointing at a
     * family with no faces, which would silently fall back to the default
     * with nothing in the UI explaining why. Clear the choice instead.
     */
    const left = await prisma.customFont.count({ where: { family: font.family } });
    if (left === 0) {
      const s = await prisma.storeSetting.findMany({
        where: { key: { in: [SETTING_KEYS.bodyFont, SETTING_KEYS.headingFont] } },
      });
      const clear: Record<string, string> = {};
      for (const row of s) if (row.value === font.family) clear[row.key] = "";
      if (Object.keys(clear).length) await setSettings(clear);
    }
  }

  revalidatePath(PAGE);
  revalidatePath("/", "layout");
  redirect(PAGE);
}
