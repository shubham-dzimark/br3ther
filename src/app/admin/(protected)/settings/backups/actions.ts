"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rm } from "node:fs/promises";
import path from "node:path";
import { requireCapability } from "@/lib/permissions";
import { BACKUP_DIR, createBackup } from "@/lib/backup";
import { getSettings, setSettings, SETTING_KEYS } from "@/lib/settings";

const PAGE = "/admin/settings/backups";

export async function saveBackupSettings(fd: FormData): Promise<void> {
  const me = await requireCapability("settings");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=forbidden`);

  await setSettings({
    [SETTING_KEYS.backupEnabled]: fd.get("backupEnabled") === "on" ? "1" : "0",
    [SETTING_KEYS.backupTime]: (() => {
      const v = String(fd.get("backupTime") ?? "").trim();
      // Fall back rather than storing something the scheduler cannot parse.
      return /^([01]?\d|2[0-3]):([0-5]\d)$/.test(v) ? v : "03:17";
    })(),
    [SETTING_KEYS.backupKeep]: String(
      Math.min(30, Math.max(1, Math.round(Number(fd.get("backupKeep")) || 1))),
    ),
    [SETTING_KEYS.backupIncludeEnv]:
      fd.get("backupIncludeEnv") === "on" ? "1" : "0",
  });

  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}

export async function runBackupNow(): Promise<void> {
  const me = await requireCapability("settings");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=forbidden`);

  const s = await getSettings();
  try {
    await createBackup({
      keep: Number(s[SETTING_KEYS.backupKeep]) || 1,
      includeEnv: s[SETTING_KEYS.backupIncludeEnv] === "1",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    redirect(`${PAGE}?error=run&detail=${encodeURIComponent(message.slice(0, 200))}`);
  }

  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=backup`);
}

export async function deleteBackup(fd: FormData): Promise<void> {
  const me = await requireCapability("settings");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=forbidden`);

  const name = String(fd.get("name") ?? "");
  // Same pattern guard as the download route - never trust a path from a form.
  if (/^br3thr-backup-[0-9-]+\.tar\.gz$/.test(name)) {
    await rm(path.join(BACKUP_DIR, name), { force: true });
  }

  revalidatePath(PAGE);
  redirect(PAGE);
}
