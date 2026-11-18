"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createCustomerSession,
  destroyCustomerSession,
  generateReferralCode,
  hashCustomerPassword,
  requireCustomer,
  verifyCustomerPassword,
} from "@/lib/customer-auth";
import { awardSignupBonus } from "@/lib/loyalty";
import { checkLoginGate, recordAttempt } from "@/lib/login-guard";
import { CHAT_COOKIE, CHAT_RESET_COOKIE } from "@/lib/chat-thread";
import { requestFingerprint } from "@/lib/client-ip";
import { mergeWishlistIntoAccount } from "@/lib/wishlist";
import { adoptCartOnLogin, releaseCartOnLogout } from "@/lib/cart";
import { createClaimToken } from "@/lib/customer-verify";
import { getMailConfig, sendMail } from "@/lib/mail";
import { escapeMailHtml, simpleEmail } from "@/lib/mail-templates";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

const MIN_PASSWORD = 10;
const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();

async function sessionMeta() {
  // Goes through requestFingerprint so the stored IP is the one our proxy
  // vouched for, not one the client typed into a header. See lib/client-ip.
  const { ip, userAgent } = await requestFingerprint();
  return { ipAddress: ip ?? undefined, userAgent: userAgent ?? undefined };
}

export async function registerCustomer(fd: FormData): Promise<void> {
  const email = text(fd, "email").toLowerCase();
  // One column, two fields. `name` stays supported for any older form post.
  const name =
    [text(fd, "firstName"), text(fd, "lastName")].filter(Boolean).join(" ") ||
    text(fd, "name");
  const password = String(fd.get("password") ?? "");
  const referredByCode = text(fd, "referralCode").toUpperCase() || null;

  if (!email || !name) redirect("/account/login?mode=register&error=missing");
  if (password.length < MIN_PASSWORD) redirect("/account/login?mode=register&error=weak");

  const existing = await prisma.customer.findUnique({ where: { email } });

  if (existing?.passwordHash) redirect("/account/login?mode=register&error=exists");

  const passwordHash = await hashCustomerPassword(password);

  /*
   * Guest checkout leaves a passwordless customer record carrying that
   * person's order history. Claiming it used to set a password and sign the
   * claimant in on the spot, so knowing the address was enough to take the
   * account. The password is now held until a link sent to that address is
   * opened - no credential is written and no session is issued before then.
   *
   * The response is the same whether or not a guest record exists, so this
   * form cannot be used to test which addresses have shopped here.
   */
  if (existing) {
    /*
     * Throttled and counted before anything is sent. Without this the claim
     * mail was a second, unmetered way to flood a known customer's mailbox -
     * the very problem the reset flow was fixed for - and each request also
     * supersedes the previous link, so repeating it kept breaking a link the
     * customer might be about to use.
     *
     * The redirect is the same either way, so a blocked request is
     * indistinguishable from a sent one.
     */
    const gate = await checkLoginGate({ kind: "CUSTOMER", email });
    await recordAttempt({
      kind: "CUSTOMER",
      email,
      success: false,
      reason: "claim_request",
    });
    if (gate.blocked) redirect("/account/login?mode=register&check=1");

    const token = await createClaimToken({
      customerId: existing.id,
      pendingPasswordHash: passwordHash,
      pendingName: name,
      pendingReferredBy: referredByCode,
    });

    const [settings, mail] = await Promise.all([getSettings(), getMailConfig()]);
    const storeName = settings[SETTING_KEYS.storeName] || "Br3thr";
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(/\/$/, "");
    const url = `${site}/account/claim/${encodeURIComponent(token)}`;

    await sendMail(
      {
        to: email,
        subject: `Finish setting up your ${storeName} account`,
        html: simpleEmail({
          storeName,
          storeUrl: site,
          heading: "Finish setting up your account",
          preheader: "Confirm this email address to set your password.",
          paragraphs: [
            `Someone asked to create a password for the ${escapeMailHtml(storeName)} account using this email address.`,
          ],
          action: { href: url, label: "Confirm and finish setting up" },
          note: "This link works once and expires in 2 hours. If this was not you, ignore this email &mdash; nothing has changed and your past orders are untouched.",
        }),
        text: `Someone asked to create a password for the ${storeName} account using this email address.\n\n${url}\n\nThis link works once and expires in 2 hours. If this was not you, ignore this email - nothing has changed.`,
      },
      mail,
    ).catch(() => undefined);

    redirect("/account/login?mode=register&check=1");
  }

  // Only reached when no record exists for this address: an unrecognised
  // email is a straightforward new account, exactly as before.
  // Phone as one field, or the code picker and number of the Br3thr form.
  const phone =
    text(fd, "phone") ||
    (text(fd, "phoneNumber") ? `${text(fd, "phoneCode")} ${text(fd, "phoneNumber")}`.trim() : "");

  const customer = await prisma.customer.create({
    data: {
      email,
      name,
      phone: phone || null,
      passwordHash,
      referralCode: generateReferralCode(name),
      referredByCode,
    },
  });

  // One-time welcome points. Guarded inside, so a retry can't double-award.
  await awardSignupBonus(customer.id);

  // "Send me offers" ticked on the signup form.
  if (fd.get("newsletter") === "on") {
    await prisma.newsletterSubscriber.upsert({
      where: { email },
      update: { customerId: customer.id },
      create: { email, source: "register", customerId: customer.id },
    });
  }

  // Anything saved before signing up follows them onto the account.
  await mergeWishlistIntoAccount(customer.id);

  await createCustomerSession(customer.id, await sessionMeta());
  // Registering mid-shop keeps the basket, same as signing in does.
  await adoptCartOnLogin(customer.id);
  revalidatePath("/", "layout");
  redirect("/account?welcome=1");
}

export async function loginCustomer(fd: FormData): Promise<void> {
  const email = text(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) redirect("/account/login?error=missing");

  // Customer accounts hold order history and addresses, so they get the same
  // brute-force ceiling the admin does.
  const gate = await checkLoginGate({ kind: "CUSTOMER", email });
  if (gate.blocked) {
    await recordAttempt({
      kind: "CUSTOMER",
      email,
      success: false,
      reason: "locked",
    });
    redirect("/account/login?error=locked");
  }

  const customer = await prisma.customer.findUnique({ where: { email } });

  // Always run a comparison so timing doesn't reveal which emails exist.
  const hash =
    customer?.passwordHash ??
    "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const ok = await verifyCustomerPassword(password, hash);

  if (!customer || !customer.passwordHash || !ok) {
    await recordAttempt({
      kind: "CUSTOMER",
      email,
      success: false,
      reason: customer?.passwordHash ? "bad_password" : "unknown_user",
    });
    redirect("/account/login?error=invalid");
  }

  await recordAttempt({ kind: "CUSTOMER", email, success: true, reason: "ok" });

  await mergeWishlistIntoAccount(customer.id);

  await createCustomerSession(customer.id, await sessionMeta());
  // Claim, restore or merge the basket now that we know whose it is.
  await adoptCartOnLogin(customer.id);
  revalidatePath("/", "layout");
  redirect("/account");
}

export async function logoutCustomer(): Promise<void> {
  await destroyCustomerSession();

  /*
   * The cart cookie goes with it. The row stays attached to the account, so
   * signing back in restores the basket while the next person on this browser
   * starts with an empty one.
   */
  await releaseCartOnLogout();

  /*
   * The chat thread cookie has to go too. It outlived the session by 30 days,
   * so after signing out the widget still opened the previous customer's
   * conversation - a real leak on any shared computer.
   */
  const jar = await cookies();
  jar.delete(CHAT_COOKIE);

  /*
   * Tells the widget, on its next poll, to forget the cached guest name and
   * email too. Those live in localStorage, which the server cannot clear, and
   * leaving them behind skipped the "before we start" gate for whoever used
   * the browser next.
   */
  jar.set(CHAT_RESET_COOKIE, "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 120,
  });

  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateAccount(fd: FormData): Promise<void> {
  const me = await requireCustomer();
  /*
   * Customer.name is one column, so the two halves are joined here. The email
   * is deliberately not read from the form: it identifies the account, owns the
   * order history and gates the welcome code, so it is not self-service.
   */
  const name =
    [text(fd, "firstName"), text(fd, "lastName")].filter(Boolean).join(" ") ||
    text(fd, "name");
  const phone = text(fd, "phone");

  await prisma.customer.update({
    where: { id: me.id },
    data: { name: name || null, phone: phone || null },
  });

  revalidatePath("/account");
  redirect(text(fd, "back") === "details" ? "/account/details?saved=1" : "/account?saved=1");
}

export async function changeAccountPassword(fd: FormData): Promise<void> {
  const me = await requireCustomer();
  const current = String(fd.get("currentPassword") ?? "");
  const next = String(fd.get("newPassword") ?? "");

  const base = String(fd.get("back") ?? "") === "details" ? "/account/details" : "/account";
  if (next.length < MIN_PASSWORD) redirect(`${base}?error=weak`);

  const customer = await prisma.customer.findUnique({ where: { id: me.id } });
  if (!customer?.passwordHash || !(await verifyCustomerPassword(current, customer.passwordHash))) {
    redirect(`${base}?error=wrong`);
  }

  await prisma.customer.update({
    where: { id: me.id },
    data: { passwordHash: await hashCustomerPassword(next) },
  });
  // Sign out everywhere after a password change.
  await prisma.customerSession.deleteMany({ where: { customerId: me.id } });

  redirect("/account/login?changed=1");
}
