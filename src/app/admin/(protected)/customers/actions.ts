"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability, can } from "@/lib/permissions";
import { BULK_RESET_MAX, sendPasswordResetEmails } from "@/lib/customer-reset";
import { clientIp } from "@/lib/client-ip";
import { hashCustomerPassword, generateReferralCode } from "@/lib/customer-auth";
import { parsePriceToCents } from "@/lib/money";
import { adjustPointsByAdmin } from "@/lib/loyalty-admin";
import { GUEST_INVITE_MAX, sendGuestInvites } from "@/lib/guest-invite";
import { deleteGuestRecords } from "@/lib/guest-records";

const MIN_PASSWORD = 10;

/**
 * Guest checkout records are read-only in the admin. Nothing is changed on one
 * - no edits, password, points, referral code or reset email - until
 * the person creates an account themselves (deleting one goes through
 * deleteGuest instead) with that email (register, or the
 * claim link that sends). Checked here, not only by hiding the forms, because
 * a server action can be called without the page.
 */
async function refuseGuest(id: string): Promise<void> {
  const record = await prisma.customer.findUnique({ where: { id }, select: { passwordHash: true } });
  if (record && !record.passwordHash) redirect(`/admin/customers/${id}?error=guest`);
}
const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();

export async function updateCustomer(fd: FormData): Promise<void> {
  await requireCapability("customers");

  const id = String(fd.get("id") ?? "");
  if (!id) redirect("/admin/customers");
  // Guest checkout records are read-only until the person creates an account.
  await refuseGuest(id);

  const email = text(fd, "email").toLowerCase();
  if (!email) redirect(`/admin/customers/${id}?error=missing`);

  const clash = await prisma.customer.findUnique({ where: { email } });
  if (clash && clash.id !== id) redirect(`/admin/customers/${id}?error=duplicate`);

  const referralCode = text(fd, "referralCode").toUpperCase() || null;
  if (referralCode) {
    const codeClash = await prisma.customer.findUnique({
      where: { referralCode },
    });
    if (codeClash && codeClash.id !== id) {
      redirect(`/admin/customers/${id}?error=code_taken`);
    }
  }

  await prisma.customer.update({
    where: { id },
    data: {
      email,
      // Customer.name is one column; the form edits it as two halves.
      name:
        [text(fd, "firstName"), text(fd, "lastName")].filter(Boolean).join(" ") ||
        text(fd, "name") ||
        null,
      phone: text(fd, "phone") || null,
      referralCode,
      creditCents: parsePriceToCents(text(fd, "credit")) ?? 0,
    },
  });

  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${id}?saved=1`);
}

/**
 * Set a customer's password on their behalf - for support cases where someone
 * can't get in. Signs them out everywhere so the old password stops working.
 */
export async function setCustomerPassword(fd: FormData): Promise<void> {
  await requireCapability("customers");

  const id = String(fd.get("id") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!id) redirect("/admin/customers");
  // Guest checkout records are read-only until the person creates an account.
  await refuseGuest(id);
  if (password.length < MIN_PASSWORD) {
    redirect(`/admin/customers/${id}?error=weak`);
  }

  await prisma.customer.update({
    where: { id },
    data: { passwordHash: await hashCustomerPassword(password) },
  });
  await prisma.customerSession.deleteMany({ where: { customerId: id } });

  revalidatePath(`/admin/customers/${id}`);
  redirect(`/admin/customers/${id}?saved=password`);
}

/**
 * Adjust the loyalty balance by hand, always leaving an audit row behind.
 * Shares its rules with the Member Points screen: no zero or oversized
 * amounts, never below zero, and the admin's name on the ledger row.
 */
export async function adjustCustomerPoints(fd: FormData): Promise<void> {
  const me = await requireCapability("customers");

  const id = String(fd.get("id") ?? "");
  if (!id) redirect("/admin/customers");
  // Guest checkout records are read-only until the person creates an account.
  await refuseGuest(id);
  const points = Math.round(Number(text(fd, "points")) || 0);
  if (points === 0) redirect(`/admin/customers/${id}`);

  const result = await adjustPointsByAdmin({
    customerId: id,
    points,
    note: text(fd, "note") || "Manual adjustment",
    adminName: me.name || me.email,
  });

  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/member-points");
  redirect(
    result.ok
      ? `/admin/customers/${id}?saved=points`
      : `/admin/customers/${id}?error=points_${result.error}`,
  );
}

export async function issueReferralCode(fd: FormData): Promise<void> {
  await requireCapability("customers");
  const id = String(fd.get("id") ?? "");
  if (!id) redirect("/admin/customers");
  // Guest checkout records are read-only until the person creates an account.
  await refuseGuest(id);

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (customer && !customer.referralCode) {
    await prisma.customer.update({
      where: { id },
      data: { referralCode: generateReferralCode(customer.name) },
    });
  }

  revalidatePath(`/admin/customers/${id}`);
  redirect(`/admin/customers/${id}?saved=1`);
}

export async function deleteCustomer(fd: FormData): Promise<void> {
  await requireCapability("customers");
  const id = String(fd.get("id") ?? "");
  if (!id) redirect("/admin/customers");
  // Guest checkout records are read-only until the person creates an account.
  await refuseGuest(id);

  // Orders survive: customerId is nulled rather than cascading, so revenue
  // history stays intact after a deletion request.
  await prisma.customer.delete({ where: { id } }).catch(() => undefined);

  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}

/**
 * Bulk delete customers.
 *
 * Orders survive - customerId is nulled rather than cascaded - so revenue
 * history and past invoices stay intact. What goes is the customer record,
 * their sign-in, saved addresses and points balance.
 *
 * Gated on customer_pii on top of "customers": a role that cannot even see an
 * email address has no business erasing the person behind it.
 */
export async function bulkDeleteCustomers(fd: FormData): Promise<void> {
  const me = await requireCapability("customers");
  if (!can(me.role, "customer_pii")) redirect("/admin/customers?bulk=forbidden");

  const ids = fd.getAll("ids").map((v) => String(v).trim()).filter(Boolean);
  let deleted = 0;
  if (ids.length) {
    // Registered accounts only; a guest record in the selection is left alone.
    const result = await prisma.customer.deleteMany({
      where: { id: { in: ids }, passwordHash: { not: null } },
    });
    deleted = result.count;
  }

  revalidatePath("/admin/customers");
  redirect(`/admin/customers?bulk=deleted&n=${deleted}`);
}

/**
 * Email one guest an invitation to create an account.
 *
 * The one thing staff can do with a guest record besides viewing and export.
 * It changes nothing on the record: the email links to the register page, and
 * registering with that address goes through the usual confirm-by-email claim.
 * Gated on customer_pii, like export: it writes to their address.
 */
export async function sendGuestInvite(fd: FormData): Promise<void> {
  const me = await requireCapability("customers");
  const id = String(fd.get("id") ?? "");
  if (!id) redirect("/admin/customers?view=guests");
  if (!can(me.role, "customer_pii")) redirect(`/admin/customers/${id}?error=forbidden`);

  const outcome = await sendGuestInvites([id]);
  if (outcome.status === "mail_off") {
    redirect(`/admin/customers/${id}?error=${outcome.reason === "disabled" ? "invite_mailoff" : "invite_incomplete"}`);
  }
  // Registered meanwhile, or gone: nothing to invite.
  if (outcome.skipped > 0) redirect(`/admin/customers/${id}`);
  if (outcome.unsubscribed > 0) redirect(`/admin/customers/${id}?error=invite_unsubscribed`);

  const failure = outcome.failed[0];
  redirect(
    failure
      ? `/admin/customers/${id}?error=invite_mail&detail=${encodeURIComponent(failure.error.slice(0, 160))}`
      : `/admin/customers/${id}?saved=invite`,
  );
}

/** Email an account invitation to every selected guest (one page at most). */
export async function bulkSendGuestInvites(fd: FormData): Promise<void> {
  const me = await requireCapability("customers");
  if (!can(me.role, "customer_pii")) redirect("/admin/customers?view=guests&bulk=forbidden");

  const ids = [...new Set(fd.getAll("ids").map((v) => String(v).trim()).filter(Boolean))];
  if (ids.length === 0) redirect("/admin/customers?view=guests");
  if (ids.length > GUEST_INVITE_MAX) redirect(`/admin/customers?view=guests&bulk=invite_toomany&n=${GUEST_INVITE_MAX}`);

  const outcome = await sendGuestInvites(ids);
  if (outcome.status === "mail_off") {
    redirect(`/admin/customers?view=guests&bulk=${outcome.reason === "disabled" ? "invite_mailoff" : "invite_incomplete"}`);
  }
  redirect(
    `/admin/customers?view=guests&bulk=invite&n=${outcome.sent}&f=${outcome.failed.length}&u=${outcome.unsubscribed}`,
  );
}

/**
 * Delete one guest checkout record. Guests only - a registered account goes
 * through deleteCustomer. Orders are kept with the customer link cleared.
 */
export async function deleteGuest(fd: FormData): Promise<void> {
  const me = await requireCapability("customers");
  const id = String(fd.get("id") ?? "");
  if (!id) redirect("/admin/customers?view=guests");
  if (!can(me.role, "customer_pii")) redirect(`/admin/customers/${id}?error=forbidden_delete`);

  const deleted = await deleteGuestRecords([id]);
  revalidatePath("/admin/customers");
  // Nothing deleted: it registered meanwhile or is already gone.
  if (deleted === 0) redirect("/admin/customers?view=guests");
  redirect("/admin/customers?view=guests&bulk=guest_deleted&n=1");
}

/** Delete every selected guest record. Registered accounts in the selection are left alone. */
export async function bulkDeleteGuests(fd: FormData): Promise<void> {
  const me = await requireCapability("customers");
  if (!can(me.role, "customer_pii")) redirect("/admin/customers?view=guests&bulk=forbidden");

  const deleted = await deleteGuestRecords(fd.getAll("ids").map((v) => String(v)));
  revalidatePath("/admin/customers");
  redirect(`/admin/customers?view=guests&bulk=guest_deleted&n=${deleted}`);
}

/** Hand a referral code to everyone selected who hasn't got one yet. */
export async function bulkIssueReferralCodes(fd: FormData): Promise<void> {
  await requireCapability("customers");

  const ids = fd.getAll("ids").map((v) => String(v).trim()).filter(Boolean);
  const targets = await prisma.customer.findMany({
    where: { id: { in: ids }, referralCode: null, passwordHash: { not: null } },
    select: { id: true, name: true, email: true },
  });

  let issued = 0;
  for (const c of targets) {
    // One at a time: generateReferralCode can collide, and the unique index
    // would abort a whole updateMany rather than skipping the one clash.
    const code = generateReferralCode(c.name ?? c.email);
    const taken = await prisma.customer.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (taken) continue;
    await prisma.customer.update({ where: { id: c.id }, data: { referralCode: code } });
    issued += 1;
  }

  revalidatePath("/admin/customers");
  redirect(`/admin/customers?bulk=codes&n=${issued}`);
}

/**
 * Email the customer a password reset link.
 *
 * The gentler half of the two options on this page. setCustomerPassword picks
 * a new password for them, which means a member of staff knows it and has to
 * pass it on somehow; this sends the customer a link only they can use, so
 * nobody at the shop ever holds their password.
 *
 * Uses exactly the same token machinery as the storefront's own forgot-password
 * form - single use, an hour to live, and every existing session of theirs is
 * dropped when it is redeemed.
 */
export async function sendCustomerResetEmail(fd: FormData): Promise<void> {
  await requireCapability("customers");

  const id = String(fd.get("id") ?? "");
  if (!id) redirect("/admin/customers");
  // Guest checkout records are read-only until the person creates an account.
  await refuseGuest(id);

  // The same send the Customers list's bulk action uses.
  const outcome = await sendPasswordResetEmails([id], { requestedIp: await clientIp() });

  if (outcome.status === "mail_off") {
    redirect(
      outcome.reason === "disabled"
        ? `/admin/customers/${id}?error=mailoff`
        : `/admin/customers/${id}?error=mail&detail=${encodeURIComponent(`Not configured: ${outcome.missing.join(", ")}.`)}`,
    );
  }
  if (outcome.skipped > 0) redirect("/admin/customers");

  revalidatePath(`/admin/customers/${id}`);
  const failure = outcome.failed[0];
  redirect(
    failure
      ? `/admin/customers/${id}?error=mail&detail=${encodeURIComponent(failure.error.slice(0, 160))}`
      : `/admin/customers/${id}?saved=reset`,
  );
}

/**
 * Email a password reset link to every selected customer.
 *
 * Each gets their own single-use link, good for an hour; any link they were
 * sent before stops working. Capped at one page of the list so the request
 * finishes well inside Cloudflare's time limit.
 */
export async function bulkSendResetEmails(fd: FormData): Promise<void> {
  await requireCapability("customers");

  const ids = [...new Set(fd.getAll("ids").map((v) => String(v).trim()).filter(Boolean))];
  if (ids.length === 0) redirect("/admin/customers");
  if (ids.length > BULK_RESET_MAX) redirect(`/admin/customers?bulk=reset_toomany&n=${BULK_RESET_MAX}`);

  // Registered accounts only: a reset link would hand a guest record a password.
  const registered = (
    await prisma.customer.findMany({
      where: { id: { in: ids }, passwordHash: { not: null } },
      select: { id: true },
    })
  ).map((c) => c.id);
  if (registered.length === 0) redirect("/admin/customers");

  const outcome = await sendPasswordResetEmails(registered, { requestedIp: await clientIp() });
  if (outcome.status === "mail_off") {
    redirect(
      outcome.reason === "disabled"
        ? "/admin/customers?bulk=reset_mailoff"
        : "/admin/customers?bulk=reset_incomplete",
    );
  }

  redirect(`/admin/customers?bulk=reset&n=${outcome.sent}&f=${outcome.failed.length}`);
}
