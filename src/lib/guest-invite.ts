import "server-only";
import { prisma } from "@/lib/prisma";
import {
  getMailConfig,
  missingMailFields,
  sendMail,
  type Mail,
  type MailConfig,
  type SendResult,
} from "@/lib/mail";
import { simpleEmail, escapeMailHtml } from "@/lib/mail-templates";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { unsubscribeToken } from "@/lib/abandoned-cart";

/*
 * "Create your account" invitations for guest checkouts, sent by staff from the
 * Guests tab or a guest's record.
 *
 * The email only links to the normal register page. Nothing is created or
 * changed on the guest record: when they register with the same email the
 * existing claim flow confirms the address and moves their past orders onto
 * the new account. So an invite can never hand anyone an account by itself.
 *
 * It is a promotional message (it mentions offers), so it carries the same
 * signed unsubscribe link as cart reminders and skips any address that has
 * unsubscribed.
 */

/** One page of the Guests list; SMTP one message at a time must finish inside Cloudflare's limit. */
export const GUEST_INVITE_MAX = 100;

const CONCURRENCY = 4;

export type GuestInviteOutcome =
  | { status: "mail_off"; reason: "disabled" | "incomplete"; missing: string[] }
  | {
      status: "done";
      sent: number;
      failed: { email: string; error: string }[];
      /** Registered already (not a guest any more) or no longer exists. */
      skipped: number;
      /** Unsubscribed from marketing email. */
      unsubscribed: number;
    };

export function guestInviteEmail(opts: {
  storeName: string;
  storeUrl: string;
  email: string;
  registerUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const store = escapeMailHtml(opts.storeName);
  const email = escapeMailHtml(opts.email);
  return {
    subject: `Create your ${opts.storeName} account`,
    html: simpleEmail({
      storeName: opts.storeName,
      storeUrl: opts.storeUrl,
      heading: "Create your account",
      preheader: "See your orders, earn points and get member offers.",
      paragraphs: [
        `Thanks for shopping with ${store}. You checked out as a guest, so there is no account for <strong>${email}</strong> yet.`,
        "Create a free account with this same email address and your past orders will be waiting for you. With an account you can check your orders and shipping any time, earn points on future purchases, and get member-only offers.",
      ],
      action: { href: opts.registerUrl, label: "Create my account" },
      note: `Use ${email} when you register so your orders are linked. We'll email you a link to confirm it's you. Don't want emails like this? <a href="${escapeMailHtml(opts.unsubscribeUrl)}" style="color:inherit;text-decoration:underline;">Unsubscribe</a>. You'll still get emails about orders you place.`,
    }),
    text: [
      `Thanks for shopping with ${opts.storeName}. You checked out as a guest, so there is no account for ${opts.email} yet.`,
      "Create a free account with this same email address and your past orders will be waiting for you. With an account you can check your orders and shipping any time, earn points on future purchases, and get member-only offers.",
      `Create my account: ${opts.registerUrl}`,
      `Use ${opts.email} when you register so your orders are linked. We'll email you a link to confirm it's you.`,
      `Unsubscribe: ${opts.unsubscribeUrl}`,
    ].join("\n\n"),
  };
}

export async function sendGuestInvites(
  customerIds: string[],
  opts: {
    /** Overrides for tests; normally read from the store settings. */
    mail?: MailConfig;
    send?: (mail: Mail, config: MailConfig) => Promise<SendResult>;
    storeName?: string;
    siteUrl?: string;
  } = {},
): Promise<GuestInviteOutcome> {
  const ids = [...new Set(customerIds.map((id) => id.trim()).filter(Boolean))].slice(0, GUEST_INVITE_MAX);

  const mail = opts.mail ?? (await getMailConfig());
  if (!mail.enabled) return { status: "mail_off", reason: "disabled", missing: [] };
  const missing = missingMailFields(mail);
  if (missing.length) return { status: "mail_off", reason: "incomplete", missing };

  const send = opts.send ?? sendMail;
  const storeName = opts.storeName ?? ((await getSettings())[SETTING_KEYS.storeName] || "Br3thr");
  const siteUrl = (opts.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(/\/$/, "");

  // Guests only: a registered account has nothing to create.
  const guests = ids.length
    ? await prisma.customer.findMany({
        where: { id: { in: ids }, passwordHash: null },
        select: { email: true },
      })
    : [];
  const suppressed = new Set(
    guests.length
      ? (
          await prisma.emailSuppression.findMany({
            where: { email: { in: guests.map((g) => g.email.trim().toLowerCase()) } },
            select: { email: true },
          })
        ).map((s) => s.email)
      : [],
  );
  const queue = guests.filter((g) => !suppressed.has(g.email.trim().toLowerCase()));

  let sent = 0;
  const failed: { email: string; error: string }[] = [];

  const worker = async () => {
    for (let g = queue.shift(); g; g = queue.shift()) {
      const unsubscribeUrl = `${siteUrl}/unsubscribe?email=${encodeURIComponent(g.email)}&t=${await unsubscribeToken(g.email)}`;
      const result = await send(
        {
          to: g.email,
          ...guestInviteEmail({
            storeName,
            storeUrl: siteUrl,
            email: g.email,
            registerUrl: `${siteUrl}/account/register`,
            unsubscribeUrl,
          }),
        },
        mail,
      );
      if (result.ok) sent += 1;
      else failed.push({ email: g.email, error: result.error });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  return {
    status: "done",
    sent,
    failed,
    skipped: ids.length - guests.length,
    unsubscribed: suppressed.size,
  };
}
