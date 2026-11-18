"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/permissions";
import { setSettings, SETTING_KEYS } from "@/lib/settings";
import { fromLocalInput, getTimeZone } from "@/lib/timezone";

const PAGE = "/admin/content/announcement";

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const flag = (fd: FormData, n: string) => (fd.get(n) === "on" ? "1" : "0");
const int = (fd: FormData, n: string, fallback: string) => {
  const v = Number.parseInt(String(fd.get(n) ?? ""), 10);
  return Number.isFinite(v) && v >= 0 ? String(v) : fallback;
};

export async function saveAnnouncement(fd: FormData): Promise<void> {
  await requireCapability("content");

  /*
   * The end time arrives as a local datetime-local value. Stored as an ISO
   * instant so the countdown means the same thing in every timezone - a raw
   * "2026-09-30T23:59" would end at a different moment for each visitor.
   */
  const endsRaw = text(fd, "endsAt");
  // Read in the store's zone, not the server's - see fromLocalInput.
  const endsAt = endsRaw ? fromLocalInput(endsRaw, await getTimeZone()) : null;

  await setSettings({
    [SETTING_KEYS.announceEnabled]: flag(fd, "enabled"),
    [SETTING_KEYS.announceMessages]: String(fd.get("messages") ?? "")
      .split("\n")
      .map((m) => m.trim())
      .filter(Boolean)
      .slice(0, 5)
      .join("\n"),
    [SETTING_KEYS.announceEyebrow]: text(fd, "eyebrow"),
    [SETTING_KEYS.announceCoupon]: text(fd, "coupon").toUpperCase(),
    [SETTING_KEYS.announceLinkUrl]: text(fd, "linkUrl"),
    [SETTING_KEYS.announceLinkLabel]: text(fd, "linkLabel"),
    [SETTING_KEYS.announceStyle]: ["highlight", "dark", "custom"].includes(text(fd, "style"))
      ? text(fd, "style")
      : "highlight",
    [SETTING_KEYS.announceBg]: text(fd, "bg"),
    [SETTING_KEYS.announceFg]: text(fd, "fg"),
    [SETTING_KEYS.announceEndsAt]:
      endsAt ? endsAt.toISOString() : "",
    [SETTING_KEYS.announceDismissible]: flag(fd, "dismissible"),
    [SETTING_KEYS.announceHideDays]: int(fd, "hideDays", "1"),
    [SETTING_KEYS.announceRotateSeconds]: int(fd, "rotateSeconds", "6"),
    [SETTING_KEYS.announceLayout]: text(fd, "layout") === "rotate" ? "rotate" : "strip",
    [SETTING_KEYS.announceSticky]: flag(fd, "sticky"),
  });

  revalidatePath(PAGE);
  revalidatePath("/", "layout");
  redirect(`${PAGE}?saved=1`);
}
