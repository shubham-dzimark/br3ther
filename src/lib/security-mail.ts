import "server-only";
import { prisma } from "@/lib/prisma";
import { getMailConfig, sendMail } from "@/lib/mail";
import { newLocationEmail } from "@/lib/mail-templates";
import { getSecurityConfig } from "@/lib/login-guard";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getTimeZone } from "@/lib/timezone";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com"
).replace(/\/$/, "");

/**
 * Tell the account owner when a sign-in comes from somewhere new.
 *
 * This is the part that turns the audit trail from something you have to
 * remember to read into something that comes and finds you. Sent to the admin
 * themselves and to the store's admin recipients, so a compromised staff
 * account is visible to the owner too.
 */
export async function sendNewLocationAlert(opts: {
  adminUserId: string;
  ip: string | null;
  userAgent: string | null;
  usedRecoveryCode?: boolean;
}): Promise<void> {
  const config = await getSecurityConfig();
  if (!config.alertNewIp && !opts.usedRecoveryCode) return;

  const [user, mail, settings] = await Promise.all([
    prisma.adminUser.findUnique({
      where: { id: opts.adminUserId },
      select: { email: true, name: true },
    }),
    getMailConfig(),
    getSettings(),
  ]);
  if (!user || !mail.enabled) return;

  // The geo columns are filled asynchronously just after the attempt row is
  // written, so give that a moment before reading it back. Missing location is
  // not a reason to hold the alert.
  await new Promise((r) => setTimeout(r, 1200));
  const attempt = await prisma.loginAttempt.findFirst({
    where: { adminUserId: opts.adminUserId, success: true },
    orderBy: { createdAt: "desc" },
    select: { city: true, country: true, createdAt: true },
  });

  const location = [attempt?.city, attempt?.country].filter(Boolean).join(", ");
  const storeName = settings[SETTING_KEYS.storeName] || "Br3thr";

  const body = newLocationEmail({
    storeName,
    storeUrl: SITE_URL,
    adminName: `${user.name} (${user.email})`,
    when: (attempt?.createdAt ?? new Date()).toLocaleString("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: await getTimeZone(),
    }),
    ip: opts.ip ?? "Unknown",
    location,
    device: describeDevice(opts.userAgent),
    usedRecoveryCode: Boolean(opts.usedRecoveryCode),
  });

  const to = Array.from(new Set([user.email, ...mail.adminRecipients]));
  await sendMail({ to, ...body }, mail);
}

/**
 * A user agent string, shortened to the bit a human can act on. Nobody
 * recognises their own laptop from 180 characters of Mozilla/5.0 boilerplate.
 */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";

  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";

  const os =
    /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "";

  return os ? `${browser} on ${os}` : browser;
}
