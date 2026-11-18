"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { setSettings, SETTING_KEYS } from "@/lib/settings";
import { sanitizeRichText } from "@/lib/rich-text";
import { GATEWAY_KEYS } from "@/lib/payment-gateways";
import { getCryptoConfig, getSiteData } from "@/lib/crypto-pay";

const LABELS = { emt: "Interac e-Transfer", crypto: "Crypto Payment" } as const;

/**
 * The Payment gateways screen: each gateway on or off.
 *
 * Only the switch is saved here. The checkout title is edited on each
 * gateway's own settings page, and the checkout order is left as stored
 * (Interac first), so saving this list never overwrites either.
 */
export async function saveGateways(fd: FormData): Promise<void> {
  await requireCapability("settings");

  for (const [index, key] of GATEWAY_KEYS.entries()) {
    const isEnabled = fd.get(`enabled_${key}`) === "on";

    await prisma.paymentMethod.upsert({
      where: { key },
      create: { key, label: LABELS[key], isEnabled, sortOrder: index },
      update: { isEnabled },
    });
  }

  revalidatePath("/admin/settings/payments");
  revalidatePath("/checkout");
  redirect("/admin/settings/payments?saved=1");
}

/** A usable absolute URL, or empty - esc_url_raw's job in the plugin. */
function cleanUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString().replace(/\/+$/, "") : "";
  } catch {
    return "";
  }
}

/**
 * Crypto Payment settings, "Save & Validate" (class-crypto-settings.php).
 *
 * Everything is stored as entered, then the connection is tested against the
 * portal. The gateway is active only when that test succeeds; any failure -
 * no HTTPS, a missing key, the portal refusing - leaves it inactive and says
 * why.
 */
export async function saveCryptoSettings(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const current = await getCryptoConfig();

  const endpointUrl = cleanUrl(String(fd.get("endpoint_url") ?? ""));

  // Write-only secrets: left blank, the stored key is kept rather than wiped.
  const keep = (field: string, stored: string) => {
    const typed = String(fd.get(field) ?? "").trim();
    return typed && !typed.startsWith("•") ? typed : stored;
  };
  const staticKey = keep("static_key", current.staticKey);
  const siteKey = keep("site_key", current.siteKey);

  const currency = fd.get("currency") === "USD" ? "USD" : "CAD";
  const mode = fd.get("mode") === "live" ? "live" : "test";
  const title = String(fd.get("title") ?? "").trim().slice(0, 80) || "Crypto Payment";
  const description = sanitizeRichText(String(fd.get("description") ?? ""));
  const isEnabled = fd.get("enabled") === "on";

  let active = false;
  let result: "ok" | "no_https" | "incomplete" | "fail";
  let detail = "";

  if (endpointUrl && !endpointUrl.toLowerCase().startsWith("https://")) {
    result = "no_https";
  } else if (!endpointUrl || !staticKey || !siteKey) {
    result = "incomplete";
  } else {
    const res = await getSiteData({ endpointUrl, staticKey, siteKey }, currency);
    if (res.ok) {
      active = true;
      result = "ok";
    } else {
      result = "fail";
      detail = res.error;
    }
  }

  await setSettings({
    [SETTING_KEYS.cryptoEndpointUrl]: endpointUrl,
    [SETTING_KEYS.cryptoStaticKey]: staticKey,
    [SETTING_KEYS.cryptoSiteKey]: siteKey,
    [SETTING_KEYS.cryptoCurrency]: currency,
    [SETTING_KEYS.cryptoMode]: mode,
    [SETTING_KEYS.cryptoTitle]: title,
    [SETTING_KEYS.cryptoDescription]: description,
    [SETTING_KEYS.cryptoActive]: active ? "1" : "0",
  });

  await prisma.paymentMethod.upsert({
    where: { key: "crypto" },
    create: { key: "crypto", label: LABELS.crypto, isEnabled, sortOrder: 1 },
    update: { isEnabled },
  });

  revalidatePath("/admin/settings/payments");
  revalidatePath("/admin/settings/payments/crypto");
  revalidatePath("/checkout");

  const params = new URLSearchParams({ result });
  if (detail) params.set("detail", detail.slice(0, 200));
  redirect(`/admin/settings/payments/crypto?${params.toString()}`);
}
