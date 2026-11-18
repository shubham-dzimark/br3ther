import "server-only";
import { prisma } from "@/lib/prisma";
import { createResetToken } from "@/lib/password-reset";
import { getMailConfig, missingMailFields, sendMail, type MailConfig } from "@/lib/mail";
import { passwordResetEmail } from "@/lib/mail-templates";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

/*
 * Password reset emails sent by staff - one customer from their page, or many
 * from the Customers list. Both go through here, so a bulk send gives exactly
 * the link and email a single send does.
 */

/** Matches the storefront's own reset links (see password-reset.ts). */
export const RESET_LINK_MINUTES = 60;

/**
 * Most customers in one bulk send: one page of the Customers list. Mail goes
 * out over SMTP one message at a time, and a much larger batch would outlast
 * Cloudflare's 100-second limit on the request.
 */
export const BULK_RESET_MAX = 100;

/** Parallel SMTP sends - quick enough, and gentle on the mail provider. */
const CONCURRENCY = 4;

export type ResetSendOutcome =
  | { status: "mail_off"; reason: "disabled" | "incomplete"; missing: string[] }
  | {
      status: "done";
      sent: number;
      failed: { email: string; error: string }[];
      /** Ids that matched no customer (deleted meanwhile). */
      skipped: number;
    };

export async function sendPasswordResetEmails(
  customerIds: string[],
  opts: {
    requestedIp: string | null;
    /** Overrides for tests; normally read from the store settings. */
    mail?: MailConfig;
    storeName?: string;
    siteUrl?: string;
  },
): Promise<ResetSendOutcome> {
  const ids = [...new Set(customerIds.map((id) => id.trim()).filter(Boolean))].slice(0, BULK_RESET_MAX);

  const mail = opts.mail ?? (await getMailConfig());
  // Stop before minting any links: a token nobody receives still cancels the
  // customer's previous one.
  if (!mail.enabled) return { status: "mail_off", reason: "disabled", missing: [] };
  const missing = missingMailFields(mail);
  if (missing.length) return { status: "mail_off", reason: "incomplete", missing };

  const storeName =
    opts.storeName ?? ((await getSettings())[SETTING_KEYS.storeName] || "Br3thr");
  const siteUrl = (opts.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(/\/$/, "");

  const customers = ids.length
    ? await prisma.customer.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true },
      })
    : [];

  let sent = 0;
  const failed: { email: string; error: string }[] = [];
  const queue = [...customers];

  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const token = await createResetToken(c.id, opts.requestedIp);
      const result = await sendMail(
        {
          to: c.email,
          ...passwordResetEmail({
            storeName,
            storeUrl: siteUrl,
            resetUrl: `${siteUrl}/account/reset/${token}`,
            minutes: RESET_LINK_MINUTES,
          }),
        },
        mail,
      );
      if (result.ok) sent += 1;
      else failed.push({ email: c.email, error: result.error });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  return { status: "done", sent, failed, skipped: ids.length - customers.length };
}
