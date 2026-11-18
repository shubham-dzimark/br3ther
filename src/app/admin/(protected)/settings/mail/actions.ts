"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/permissions";
import { getSettings, setSettings, SETTING_KEYS } from "@/lib/settings";
import {
  getMailConfig,
  sendMail,
  splitAddresses,
  verifyMailConnection,
} from "@/lib/mail";
import { testEmail } from "@/lib/mail-templates";

const PAGE = "/admin/settings/mail";
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com"
).replace(/\/+$/, "");

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const flag = (fd: FormData, n: string) => (fd.get(n) === "on" ? "1" : "0");

export async function saveMailSettings(fd: FormData): Promise<void> {
  const me = await requireCapability("settings");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=forbidden`);

  const port = Math.min(65535, Math.max(1, Number(fd.get("mailPort")) || 465));

  /*
   * A blank password means "leave the stored one alone" - the field is
   * rendered empty on every load so the secret is never written into the
   * page HTML, and clearing it deliberately would otherwise be
   * indistinguishable from just not retyping it. "Forget password" handles
   * the deliberate case.
   */
  const typedPass = String(fd.get("mailPass") ?? "");
  const clearPass = fd.get("clearPass") === "on";

  await setSettings({
    [SETTING_KEYS.mailEnabled]: flag(fd, "mailEnabled"),
    [SETTING_KEYS.mailHost]: text(fd, "mailHost") || "smtp.zoho.com",
    [SETTING_KEYS.mailPort]: String(port),
    // 465 is implicit TLS and 587 is STARTTLS; getting this wrong is the most
    // common cause of a connection that just hangs, so it follows the port.
    [SETTING_KEYS.mailSecure]: port === 465 ? "1" : flag(fd, "mailSecure"),
    [SETTING_KEYS.mailUser]: text(fd, "mailUser"),
    ...(clearPass
      ? { [SETTING_KEYS.mailPass]: "" }
      : typedPass
        ? { [SETTING_KEYS.mailPass]: typedPass }
        : {}),
    [SETTING_KEYS.mailFromName]: text(fd, "mailFromName"),
    [SETTING_KEYS.mailFromEmail]: text(fd, "mailFromEmail"),
    [SETTING_KEYS.mailReplyTo]: text(fd, "mailReplyTo"),
    [SETTING_KEYS.mailAdminRecipients]: splitAddresses(
      text(fd, "mailAdminRecipients"),
    ).join(", "),
    [SETTING_KEYS.mailSendOrderPlaced]: flag(fd, "sendOrderPlaced"),
    [SETTING_KEYS.mailSendPaymentReceived]: flag(fd, "sendPaymentReceived"),
    [SETTING_KEYS.mailSendShipped]: flag(fd, "sendShipped"),
    [SETTING_KEYS.mailSendWelcomeCode]: flag(fd, "sendWelcomeCode"),
    [SETTING_KEYS.mailSendAdminNewOrder]: flag(fd, "sendAdminNewOrder"),
    [SETTING_KEYS.mailInvoiceOn]: ["none", "placed", "paid", "shipped", "delivered"].includes(
      text(fd, "invoiceOn"),
    )
      ? text(fd, "invoiceOn")
      : "paid",
  });

  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}

/** Opens an SMTP session and authenticates, without sending anything. */
export async function testMailConnection(): Promise<void> {
  const me = await requireCapability("settings");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=forbidden`);

  const result = await verifyMailConnection();
  if (result.ok) redirect(`${PAGE}?saved=verified`);
  redirect(
    `${PAGE}?error=verify&detail=${encodeURIComponent(result.error.slice(0, 300))}`,
  );
}

export async function sendTestEmail(fd: FormData): Promise<void> {
  const me = await requireCapability("settings");
  if (me.role !== "OWNER") redirect(`${PAGE}?error=forbidden`);

  const settings = await getSettings();
  const config = await getMailConfig();

  // Falls back to the signed-in admin, so the button works before the admin
  // recipients field has been filled in.
  const to = text(fd, "testTo") || config.adminRecipients[0] || me.email;
  if (!to.includes("@")) redirect(`${PAGE}?error=norecipient`);

  const result = await sendMail(
    {
      to,
      ...testEmail(settings[SETTING_KEYS.storeName] || "Br3thr", SITE_URL),
    },
    // Verify against what is saved, but allow a test while the master switch
    // is still off - otherwise you cannot check settings before going live.
    { ...config, enabled: true },
  );

  if (result.ok) {
    redirect(`${PAGE}?saved=sent&detail=${encodeURIComponent(to)}`);
  }
  redirect(
    `${PAGE}?error=send&detail=${encodeURIComponent(result.error.slice(0, 300))}`,
  );
}
