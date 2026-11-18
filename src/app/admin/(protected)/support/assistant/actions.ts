"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/permissions";
import { getSettings, setSettings, SETTING_KEYS } from "@/lib/settings";
import { testVenice } from "@/lib/ai-venice";

const PAGE = "/admin/support/assistant";

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const flag = (fd: FormData, n: string) => (fd.get(n) === "on" ? "1" : "0");
const int = (fd: FormData, n: string, d: string) => {
  const v = Number.parseInt(String(fd.get(n) ?? ""), 10);
  return Number.isFinite(v) && v >= 0 ? String(v) : d;
};

export async function saveAssistantSettings(fd: FormData): Promise<void> {
  const me = await requireCapability("support");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=forbidden`);

  const values: Record<string, string> = {
    [SETTING_KEYS.aiMode]: ["off", "rules", "ai"].includes(text(fd, "mode"))
      ? text(fd, "mode")
      : "off",
    // Kept in step so nothing still reading the old flag disagrees.
    [SETTING_KEYS.aiEnabled]: text(fd, "mode") === "off" ? "0" : "1",
    [SETTING_KEYS.aiProvider]: text(fd, "provider") === "venice" ? "venice" : "anthropic",
    [SETTING_KEYS.aiModel]: text(fd, "model") || "claude-opus-5",
    [SETTING_KEYS.aiVeniceModel]: text(fd, "veniceModel") || "zai-org-glm-4.7-flash",
    [SETTING_KEYS.aiPersona]: String(fd.get("persona") ?? "").slice(0, 4000),
    [SETTING_KEYS.aiGreeting]: String(fd.get("greeting") ?? "").slice(0, 1000),
    [SETTING_KEYS.aiMaxRepliesPerThread]: int(fd, "maxReplies", "8"),
    [SETTING_KEYS.aiDailyMessageCap]: int(fd, "dailyCap", "300"),
    [SETTING_KEYS.aiShareProducts]: flag(fd, "shareProducts"),
    [SETTING_KEYS.aiStockDetail]: ["exact", "vague", "hidden"].includes(text(fd, "stockDetail"))
      ? text(fd, "stockDetail")
      : "vague",
    [SETTING_KEYS.aiShareOffers]: flag(fd, "shareOffers"),
    [SETTING_KEYS.aiShareCoupons]: flag(fd, "shareCoupons"),
    [SETTING_KEYS.aiAllowOrderLookup]: flag(fd, "allowOrderLookup"),
    [SETTING_KEYS.aiAllowPasswordReset]: flag(fd, "allowPasswordReset"),
    [SETTING_KEYS.aiOfflineOnly]: flag(fd, "offlineOnly"),
    [SETTING_KEYS.aiStaffHoursStart]: int(fd, "hoursStart", "9"),
    [SETTING_KEYS.aiStaffHoursEnd]: int(fd, "hoursEnd", "17"),
  };

  /*
   * The key is only written when a new one is typed, so an empty box does not
   * wipe a working key - and it is never rendered back into the form.
   */
  const key = text(fd, "apiKey");
  if (key) values[SETTING_KEYS.aiApiKey] = key;
  if (fd.get("clearKey") === "on") values[SETTING_KEYS.aiApiKey] = "";

  const vkey = text(fd, "veniceKey");
  if (vkey) values[SETTING_KEYS.aiVeniceKey] = vkey;
  if (fd.get("clearVeniceKey") === "on") values[SETTING_KEYS.aiVeniceKey] = "";

  await setSettings(values);
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}

/**
 * Ask Venice for one short completion, so a wrong key or an empty balance is
 * found here rather than in front of a customer.
 */
export async function testVeniceConnection(fd: FormData): Promise<void> {
  const me = await requireCapability("support");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=forbidden`);

  const s = await getSettings();
  // Use a key typed into the form if there is one, so it can be tried before
  // being saved; otherwise fall back to the stored or environment key.
  const key =
    text(fd, "veniceKey") ||
    process.env.VENICE_API_KEY?.trim() ||
    s[SETTING_KEYS.aiVeniceKey] ||
    "";
  const model = text(fd, "veniceModel") || s[SETTING_KEYS.aiVeniceModel] || "zai-org-glm-4.7-flash";

  if (!key) redirect(`${PAGE}?error=nokey`);

  const result = await testVenice(key, model);
  revalidatePath(PAGE);
  redirect(
    result.ok
      ? `${PAGE}?saved=tested&detail=${encodeURIComponent(result.reply.slice(0, 120))}`
      : `${PAGE}?error=test&detail=${encodeURIComponent(result.error.slice(0, 200))}`,
  );
}
