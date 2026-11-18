"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashCustomerPassword } from "@/lib/customer-auth";
import {
  consumeResetToken,
  createResetToken,
  lookupResetToken,
} from "@/lib/password-reset";
import { getMailConfig, sendMail } from "@/lib/mail";
import { passwordChangedEmail, passwordResetEmail } from "@/lib/mail-templates";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { checkLoginGate, recordAttempt } from "@/lib/login-guard";
import { clientIp } from "@/lib/client-ip";
import { getTimeZone } from "@/lib/timezone";

const MIN_PASSWORD = 10;
const TOKEN_MINUTES = 60;

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com"
).replace(/\/$/, "");

/**
 * Ask for a reset link.
 *
 * Always reports the same thing, whether or not the address has an account.
 * Anything else turns this form into a way to test which of a list of email
 * addresses shops here.
 */
export async function requestPasswordReset(fd: FormData): Promise<void> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) redirect("/account/forgot?error=email");

  /*
   * Rate limited on the same counter as sign-in. Without this the form is a
   * free way to send mail from the shop's domain to any address, repeatedly -
   * which is both harassment and a fast route to a damaged sending reputation.
   */
  const gate = await checkLoginGate({ kind: "CUSTOMER", email });
  if (gate.blocked) {
    await recordAttempt({
      kind: "CUSTOMER",
      email,
      success: false,
      reason: "locked",
    });
    redirect("/account/forgot?sent=1");
  }

  /*
   * Count the request itself, before any mail goes out.
   *
   * The gate above only ever recorded an attempt once it was already blocking,
   * so ordinary reset requests never incremented anything and the limit could
   * not be reached by asking repeatedly. Recording here means a flood of
   * requests trips the same counter a flood of bad passwords does - and each
   * new token invalidates the last, so this was also a way to keep breaking a
   * customer's working link.
   */
  await recordAttempt({
    kind: "CUSTOMER",
    email,
    success: false,
    reason: "reset_request",
  });

  const customer = await prisma.customer.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true },
  });

  // A guest-checkout record with no password still gets a link: setting one is
  // exactly how they claim the account and their order history.
  if (customer) {
    const token = await createResetToken(customer.id, await clientIp());
    const [settings, mail] = await Promise.all([getSettings(), getMailConfig()]);

    const body = passwordResetEmail({
      storeName: settings[SETTING_KEYS.storeName] || "Br3thr",
      storeUrl: SITE_URL,
      resetUrl: `${SITE_URL}/account/reset/${token}`,
      minutes: TOKEN_MINUTES,
    });

    // Awaited, unlike the order emails: if the mailbox is misconfigured the
    // customer would otherwise wait forever for a link that never left.
    const result = await sendMail({ to: customer.email, ...body }, mail);
    if (!result.ok) console.error(`[reset] could not email ${email}: ${result.error}`);
  }

  redirect("/account/forgot?sent=1");
}

/** Set the new password from a reset link. */
export async function completePasswordReset(fd: FormData): Promise<void> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirmPassword") ?? "");

  const back = `/account/reset/${encodeURIComponent(token)}`;

  if (password.length < MIN_PASSWORD) redirect(`${back}?error=weak`);
  if (password !== confirm) redirect(`${back}?error=mismatch`);

  // Re-checked here, not just when the page rendered: the form could have sat
  // open past the expiry, or the link could have been used in another tab.
  const found = await lookupResetToken(token);
  if (!found.ok) redirect(`${back}?error=${found.reason}`);

  const claimed = await consumeResetToken({
    tokenId: found.tokenId,
    customerId: found.customerId,
    passwordHash: await hashCustomerPassword(password),
  });

  // Another submission of the same link won the race. Report it as used rather
  // than pretending this one succeeded.
  if (!claimed) redirect(`${back}?error=used`);

  await recordAttempt({
    kind: "CUSTOMER",
    email: found.email,
    success: true,
    reason: "ok",
  });

  // Best effort: the reset already succeeded, so a mail failure must not be
  // reported as a failed reset.
  try {
    const [settings, mail] = await Promise.all([getSettings(), getMailConfig()]);
    await sendMail(
      {
        to: found.email,
        ...passwordChangedEmail({
          storeName: settings[SETTING_KEYS.storeName] || "Br3thr",
          storeUrl: SITE_URL,
          when: new Date().toLocaleString("en-CA", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: await getTimeZone(),
          }),
        }),
      },
      mail,
    );
  } catch {
    // Nothing to do - the password is already changed.
  }

  redirect("/account/login?changed=1");
}
