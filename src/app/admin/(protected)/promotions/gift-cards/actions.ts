"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/permissions";
import { adjustGiftCard, resendGiftCardEmail, voidGiftCard } from "@/lib/gift-cards";
import { parsePriceToCents } from "@/lib/money";
import { setSettings, SETTING_KEYS } from "@/lib/settings";

const back = (id: string, q: string) => {
  revalidatePath("/admin/promotions/gift-cards");
  redirect(`/admin/promotions/gift-cards/${id}?${q}`);
};

export async function resendGiftCard(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  const id = String(fd.get("id") ?? "");
  const ok = await resendGiftCardEmail(id);
  back(id, ok ? "sent=1" : "error=send");
}

export async function voidGiftCardAction(fd: FormData): Promise<void> {
  const me = await requireCapability("promotions");
  const id = String(fd.get("id") ?? "");
  await voidGiftCard(id, me.id, String(fd.get("note") ?? "").trim() || "Voided by staff");
  back(id, "saved=1");
}

/** A signed amount: "+5", "5" adds; "-5" takes off. A note is required. */
export async function adjustGiftCardAction(fd: FormData): Promise<void> {
  const me = await requireCapability("promotions");
  const id = String(fd.get("id") ?? "");
  const raw = String(fd.get("amount") ?? "").trim();
  const negative = raw.startsWith("-");
  const cents = parsePriceToCents(raw.replace(/^[+-]/, ""));
  const note = String(fd.get("note") ?? "").trim();
  if (!cents || !note) back(id, "error=adjust");
  const ok = await adjustGiftCard(id, negative ? -cents! : cents!, note, me.id);
  back(id, ok ? "saved=1" : "error=balance");
}

export async function saveGiftCardSettings(fd: FormData): Promise<void> {
  await requireCapability("promotions");
  await setSettings({ [SETTING_KEYS.giftCardsEnabled]: fd.get("enabled") === "on" ? "1" : "0" });
  revalidatePath("/", "layout");
  redirect("/admin/promotions/gift-cards?saved=1");
}
