import "server-only";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { brandMail, type MailBrand } from "@/lib/mail-templates";

/**
 * The storefront's colours and logo, for the email header and buttons. Never
 * throws: a settings hiccup sends the default palette rather than no email.
 */
export async function getMailBrand(): Promise<Partial<MailBrand>> {
  try {
    const s = await getSettings();
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(/\/$/, "");
    /*
     * Always the PNG copy served by /api/mail-logo.png, never the upload
     * itself: the shop's logo is a WebP, which Outlook cannot show and
     * brandMail() rightly refuses. The route converts whatever is uploaded.
     */
    const logo = s[SETTING_KEYS.logoUrl]?.trim() ?? "";
    // The Br3thr theme's emails carry its crest, a PNG served straight from disk.
    if ((s[SETTING_KEYS.storeTheme] ?? "br3thr").trim() !== "classic") {
      return { theme: "br3thr", logoUrl: `${site}/br3thr/logo-480.png`, dark: "", primary: "", highlight: "" };
    }
    const logoUrl = logo.startsWith("/uploads/") ? `${site}/api/mail-logo.png` : null;
    return {
      dark: s[SETTING_KEYS.storefrontDark] ?? "",
      primary: s[SETTING_KEYS.storefrontPrimary] ?? "",
      highlight: s[SETTING_KEYS.storefrontHighlight] ?? "",
      logoUrl,
    };
  } catch {
    return {};
  }
}

/**
 * Outgoing mail.
 *
 * Configuration lives in StoreSetting so the shop owner can change mailbox
 * without a deploy, matching how the payment portal credentials are held.
 * The password is the one exception worth knowing about: SMTP_PASS in .env
 * always wins over the stored value, so a security-minded install can keep
 * the secret off the database entirely and leave the admin field blank.
 */

export type MailConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  adminRecipients: string[];
  /** Per-message-type switches, so one noisy email can be turned off alone. */
  sendOrderPlaced: boolean;
  sendPaymentReceived: boolean;
  sendShipped: boolean;
  sendWelcomeCode: boolean;
  sendAdminNewOrder: boolean;
  /** Which customer email carries the PDF invoice. */
  invoiceOn: "none" | "placed" | "paid" | "shipped" | "delivered";
};

const on = (v: string | undefined, fallback = false) =>
  v === undefined || v === "" ? fallback : v === "1";

export async function getMailConfig(): Promise<MailConfig> {
  const s = await getSettings();

  // The store contact address is the sensible default sender: it is already
  // shown to customers in the footer, so replies land somewhere staffed.
  const fromEmail =
    s[SETTING_KEYS.mailFromEmail]?.trim() ||
    s[SETTING_KEYS.mailUser]?.trim() ||
    s[SETTING_KEYS.contactEmail]?.trim() ||
    "";

  return {
    invoiceOn: (["none", "placed", "paid", "shipped", "delivered"].includes(
      s[SETTING_KEYS.mailInvoiceOn] ?? "",
    )
      ? s[SETTING_KEYS.mailInvoiceOn]
      : "paid") as MailConfig["invoiceOn"],
    enabled: on(s[SETTING_KEYS.mailEnabled]),
    host: s[SETTING_KEYS.mailHost]?.trim() || "smtp.zohocloud.ca",
    port: Number.parseInt(s[SETTING_KEYS.mailPort] || "465", 10) || 465,
    secure: on(s[SETTING_KEYS.mailSecure], true),
    user: s[SETTING_KEYS.mailUser]?.trim() || "",
    pass: process.env.SMTP_PASS?.trim() || s[SETTING_KEYS.mailPass] || "",
    fromName: s[SETTING_KEYS.mailFromName]?.trim() || s[SETTING_KEYS.storeName] || "",
    fromEmail,
    replyTo: s[SETTING_KEYS.mailReplyTo]?.trim() || "",
    adminRecipients: splitAddresses(
      s[SETTING_KEYS.mailAdminRecipients] || s[SETTING_KEYS.contactEmail] || "",
    ),
    sendOrderPlaced: on(s[SETTING_KEYS.mailSendOrderPlaced], true),
    sendPaymentReceived: on(s[SETTING_KEYS.mailSendPaymentReceived], true),
    sendShipped: on(s[SETTING_KEYS.mailSendShipped], true),
    sendWelcomeCode: on(s[SETTING_KEYS.mailSendWelcomeCode], true),
    sendAdminNewOrder: on(s[SETTING_KEYS.mailSendAdminNewOrder], true),
  };
}

/** Accepts commas, semicolons or newlines, because people paste all three. */
export function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((a) => a.trim())
    .filter((a) => a.includes("@"));
}

/** What still has to be filled in before mail can go out. Drives the banner. */
export function missingMailFields(c: MailConfig): string[] {
  const gaps: string[] = [];
  if (!c.host) gaps.push("SMTP host");
  if (!c.user) gaps.push("username");
  if (!c.pass) gaps.push("password");
  if (!c.fromEmail) gaps.push("from address");
  return gaps;
}

function transportFor(c: MailConfig): Transporter {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    // Zoho: 465 is implicit TLS, 587 is STARTTLS. `secure` must track the port
    // or the socket hangs until the connection timeout rather than erroring.
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

export type SendResult = { ok: true; messageId: string } | { ok: false; error: string };

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type Mail = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
  /** Overrides the shop-wide reply-to (chat emails must come back to the polled mailbox). */
  replyTo?: string;
  messageId?: string;
  headers?: Record<string, string>;
};

/**
 * Send one message.
 *
 * Never throws: every caller is on a path a customer is waiting on - placing
 * an order, confirming a payment - and a refused SMTP login must not turn a
 * completed order into an error page. Failures are logged and returned.
 */
export async function sendMail(
  mail: Mail,
  config?: MailConfig,
): Promise<SendResult> {
  const c = config ?? (await getMailConfig());

  if (!c.enabled) return { ok: false, error: "Email is turned off in settings." };

  const gaps = missingMailFields(c);
  if (gaps.length) return { ok: false, error: `Not configured: ${gaps.join(", ")}.` };

  const to = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter((a) =>
    a?.includes("@"),
  );
  if (to.length === 0) return { ok: false, error: "No valid recipient." };

  // Every message gets the storefront's colours and logo in its header here,
  // so no sender can go out in an older design.
  const html = brandMail(mail.html, await getMailBrand());

  try {
    const info = await transportFor(c).sendMail({
      from: c.fromName ? `"${c.fromName}" <${c.fromEmail}>` : c.fromEmail,
      ...(mail.replyTo ? { replyTo: mail.replyTo } : c.replyTo ? { replyTo: c.replyTo } : {}),
      ...(mail.messageId ? { messageId: mail.messageId } : {}),
      ...(mail.headers ? { headers: mail.headers } : {}),
      to,
      subject: mail.subject,
      text: mail.text,
      html,
      ...(mail.attachments?.length ? { attachments: mail.attachments } : {}),
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[mail] send failed to ${to.join(", ")}: ${error}`);
    return { ok: false, error };
  }
}

/**
 * Fire-and-forget wrapper for the order paths. Deliberately not awaited by
 * callers: the customer should never wait on, or be shown, an SMTP problem.
 */
export function queueMail(mail: Mail): void {
  void sendMail(mail).catch(() => {});
}

/** Used by the "Send test email" button; reports the real SMTP error text. */
export async function verifyMailConnection(
  config?: MailConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = config ?? (await getMailConfig());
  const gaps = missingMailFields(c);
  if (gaps.length) return { ok: false, error: `Not configured: ${gaps.join(", ")}.` };

  try {
    await transportFor(c).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
