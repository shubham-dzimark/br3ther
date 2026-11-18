"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { setSetting } from "@/lib/settings";
import { SortlyError, testKey } from "@/lib/sortly/api";
import { SORTLY_KEYS, ensureWebhookToken, readSortlyConfig, runFullSync, sortlyLog } from "@/lib/sortly/sync";

const PAGE = "/admin/integrations/sortly";

export async function saveSortlySettings(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const cfg = await readSortlyConfig();

  const typedKey = String(fd.get("secretKey") ?? "").trim();
  const key = typedKey || cfg.secretKey;
  const enabled = fd.get("enabled") === "on";
  const folderRaw = String(fd.get("folderId") ?? "").trim();
  const folder = /^\d{1,12}$/.test(folderRaw) ? folderRaw : "";

  // A new key is checked before it replaces the saved one.
  let total: number | null = null;
  if (key) {
    try {
      total = await testKey(key);
    } catch (e) {
      const code = e instanceof SortlyError && e.status === 401 ? "bad_key" : "unreachable";
      redirect(`${PAGE}?result=${code}`);
    }
  } else if (enabled) {
    redirect(`${PAGE}?result=no_key`);
  }

  if (typedKey) await setSetting(SORTLY_KEYS.secretKey, typedKey);
  await setSetting(SORTLY_KEYS.enabled, enabled && key ? "1" : "0");
  await setSetting(SORTLY_KEYS.folderId, folder);
  await setSetting(SORTLY_KEYS.createMissing, fd.get("createMissing") === "on" ? "1" : "0");
  await ensureWebhookToken();
  await sortlyLog("info", "settings", `Settings saved; sync ${enabled && key ? "on" : "off"}.`);

  revalidatePath(PAGE);
  redirect(`${PAGE}?result=saved${total !== null ? `&items=${total}` : ""}`);
}

export async function syncSortlyNow(): Promise<void> {
  await requireCapability("settings");
  const cfg = await readSortlyConfig();
  if (!cfg.secretKey) redirect(`${PAGE}?result=no_key`);

  const s = await runFullSync(cfg);
  revalidatePath("/", "layout");
  revalidatePath(PAGE);
  const q = new URLSearchParams({
    ran: "1",
    scanned: String(s.scanned),
    linked: String(s.linked),
    created: String(s.created),
    synced: String(s.synced),
    unmatched: String(s.unmatched),
    errors: String(s.errors),
  });
  if (s.message) q.set("msg", s.message.slice(0, 200));
  redirect(`${PAGE}?${q}`);
}

export async function regenerateSortlyWebhook(): Promise<void> {
  await requireCapability("settings");
  await setSetting(SORTLY_KEYS.webhookToken, randomBytes(24).toString("hex"));
  await sortlyLog("warn", "settings", "Webhook URL changed; the old URL no longer works.");
  revalidatePath(PAGE);
  redirect(`${PAGE}?result=webhook`);
}

export async function unlinkSortlyVariant(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const variantId = String(fd.get("variantId") ?? "");
  if (!variantId) redirect(PAGE);
  await prisma.$transaction([
    prisma.productVariant.update({
      where: { id: variantId },
      data: { sortlyItemId: null, sortlyBaseQty: null, sortlyPendingQty: null, sortlyPendingRun: null, sortlyPendingSite: null },
    }),
    prisma.sortlyStockChange.updateMany({
      where: { variantId, appliedAt: null },
      data: { appliedAt: new Date(), lastError: "Unlinked in the admin" },
    }),
  ]);
  await sortlyLog("info", "unlink", "Unlinked in the admin.", { variantId });
  revalidatePath(PAGE);
  redirect(`${PAGE}?result=unlinked`);
}
