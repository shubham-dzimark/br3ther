"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { setSettings, SETTING_KEYS } from "@/lib/settings";
import { parseIpRules, ipMatches } from "@/lib/client-ip";
import { clientIp } from "@/lib/client-ip";
import { pruneLoginAttempts } from "@/lib/login-guard";

const PAGE = "/admin/settings/security";

const flag = (fd: FormData, name: string) => (fd.get(name) === "on" ? "1" : "0");
const int = (fd: FormData, name: string, fallback: string) => {
  const n = Number.parseInt(String(fd.get(name) ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? String(n) : fallback;
};

export async function saveSecuritySettings(fd: FormData): Promise<void> {
  const me = await requireCapability("settings");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=forbidden`);

  const allowlistRaw = String(fd.get("adminIpAllowlist") ?? "").trim();
  const rules = parseIpRules(allowlistRaw);

  /*
   * Guard rail on the allowlist: saving a list that does not include the
   * address you are sitting at would lock you out of the panel with no way
   * back in except the database. Refuse rather than accept it.
   */
  if (rules.length) {
    const ip = await clientIp();
    if (!ip || !rules.some((r) => ipMatches(ip, r))) {
      redirect(`${PAGE}?error=lockout&detail=${encodeURIComponent(ip ?? "unknown")}`);
    }
  }

  await setSettings({
    [SETTING_KEYS.secMaxAttempts]: int(fd, "maxAttempts", "8"),
    [SETTING_KEYS.secWindowMinutes]: int(fd, "windowMinutes", "15"),
    [SETTING_KEYS.secLockoutMinutes]: int(fd, "lockoutMinutes", "15"),
    [SETTING_KEYS.secSessionHours]: int(fd, "sessionHours", "12"),
    [SETTING_KEYS.secIdleMinutes]: int(fd, "idleMinutes", "30"),
    [SETTING_KEYS.secCustomerSessionDays]: int(fd, "customerSessionDays", "7"),
    [SETTING_KEYS.secCustomerIdleHours]: int(fd, "customerIdleHours", "2"),
    [SETTING_KEYS.secLogRetentionDays]: int(fd, "logRetentionDays", "90"),
    [SETTING_KEYS.secAdminIpAllowlist]: rules.join("\n"),
    [SETTING_KEYS.secAlertNewIp]: flag(fd, "alertNewIp"),
    [SETTING_KEYS.secGeoLookup]: flag(fd, "geoLookup"),
    [SETTING_KEYS.secRequire2fa]: flag(fd, "require2fa"),
    [SETTING_KEYS.secThrottleCustomers]: flag(fd, "throttleCustomers"),
  });

  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}

/** Kill one session belonging to anyone. Owner only - it can sign out staff. */
export async function revokeAnySession(fd: FormData): Promise<void> {
  const me = await requireCapability("settings");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=forbidden`);

  const id = String(fd.get("sessionId") ?? "");
  if (id) await prisma.adminSession.deleteMany({ where: { id } });

  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=revoked`);
}

/**
 * Sign out every admin, including the one clicking. The panic button for
 * "someone has a session they shouldn't" - it does not need to know which.
 */
export async function revokeEveryAdminSession(): Promise<void> {
  const me = await requireCapability("settings");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=forbidden`);

  await prisma.adminSession.deleteMany({});
  redirect("/admin/login?error=expired");
}

export async function clearOldAttempts(): Promise<void> {
  const me = await requireCapability("settings");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=forbidden`);

  const removed = await pruneLoginAttempts();
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=pruned&detail=${removed}`);
}
