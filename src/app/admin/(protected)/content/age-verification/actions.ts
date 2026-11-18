"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/permissions";
import { setSettings, SETTING_KEYS } from "@/lib/settings";

const PAGE = "/admin/content/age-verification";
const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();

export async function saveAgeGate(fd: FormData): Promise<void> {
  await requireCapability("content");

  const url = text(fd, "declineUrl");
  // Only absolute http(s) or a site-relative path; anything else could send a
  // declined visitor somewhere the shop did not intend.
  const safeUrl = /^https?:\/\//i.test(url) || url.startsWith("/") ? url : "";

  await setSettings({
    [SETTING_KEYS.ageGateEnabled]: fd.get("enabled") === "on" ? "1" : "0",
    [SETTING_KEYS.ageGateMinAge]: String(
      Math.min(99, Math.max(1, Number(fd.get("minAge")) || 18)),
    ),
    [SETTING_KEYS.ageGateMode]: text(fd, "mode") === "dob" ? "dob" : "confirm",
    [SETTING_KEYS.ageGateTitle]: text(fd, "title"),
    [SETTING_KEYS.ageGateBody]: text(fd, "body"),
    [SETTING_KEYS.ageGateConfirmLabel]: text(fd, "confirmLabel"),
    [SETTING_KEYS.ageGateDeclineLabel]: text(fd, "declineLabel"),
    [SETTING_KEYS.ageGateDeclineUrl]: safeUrl,
    [SETTING_KEYS.ageGateDeclineMessage]: text(fd, "declineMessage"),
    [SETTING_KEYS.ageGateRememberDays]: String(
      Math.min(365, Math.max(0, Number(fd.get("rememberDays")) || 0)),
    ),
    [SETTING_KEYS.ageGateImage]: text(fd, "image"),
    [SETTING_KEYS.ageGateFootnote]: text(fd, "footnote"),
  });

  revalidatePath(PAGE);
  revalidatePath("/", "layout");
  redirect(`${PAGE}?saved=1`);
}
