"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { setSettings, SETTING_KEYS } from "@/lib/settings";
import { runRecoverySweep, sendReminderNow } from "@/lib/abandoned-cart";
import { restoreDefaultFollowUps } from "@/lib/cart-follow-ups";

const PAGE = "/admin/abandoned-carts";

/**
 * Delete abandoned carts.
 *
 * Only ever touches carts that are still ACTIVE - a cart that converted holds
 * the link back to the order it became (recoveredOrderId), and deleting one of
 * those would quietly break that trail. Cart items go with the row by cascade.
 */
export async function bulkDeleteCarts(fd: FormData): Promise<void> {
  await requireCapability("reports");

  const ids = fd.getAll("ids").map((v) => String(v).trim()).filter(Boolean);
  let removed = 0;
  if (ids.length) {
    const result = await prisma.cart.deleteMany({
      // The two states this screen actually lists. CONVERTED carts are
      // excluded: they carry recoveredOrderId, the link back to the order
      // they became, and deleting one would break that trail.
      where: { id: { in: ids }, status: { in: ["ACTIVE", "ABANDONED"] } },
    });
    removed = result.count;
  }

  revalidatePath(PAGE);
  redirect(`${PAGE}?tab=carts&bulk=deleted&n=${removed}`);
}


/* ---------- Recovery email setup ---------- */

const int = (fd: FormData, name: string, fallback: string) => {
  const n = Number.parseInt(String(fd.get(name) ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? String(n) : fallback;
};

export async function saveRecoverySettings(fd: FormData): Promise<void> {
  const me = await requireCapability("reports");
  if (me.role !== "OWNER") redirect(`${PAGE}?tab=settings&error=forbidden`);

  await setSettings({
    [SETTING_KEYS.cartRecoveryEnabled]: fd.get("enabled") === "on" ? "1" : "0",
    [SETTING_KEYS.cartRecoveryDelayMinutes]: int(fd, "delayMinutes", "360"),
    [SETTING_KEYS.cartRecoveryMaxReminders]: int(fd, "maxReminders", "2"),
    [SETTING_KEYS.cartRecoveryIntervalHours]: int(fd, "intervalHours", "24"),
    [SETTING_KEYS.cartRecoveryCoupon]: String(fd.get("coupon") ?? "").trim().toUpperCase(),
    [SETTING_KEYS.cartRecoveryCouponFrom]: int(fd, "couponFrom", "2"),
  });

  revalidatePath(PAGE);
  redirect(`${PAGE}?tab=settings&saved=1`);
}

/** Send one reminder by hand, for testing the setup or chasing a big cart. */
export async function sendOneReminder(fd: FormData): Promise<void> {
  await requireCapability("reports");
  const id = String(fd.get("cartId") ?? "");
  if (!id) redirect(PAGE);

  const result = await sendReminderNow(id);
  revalidatePath(PAGE);
  redirect(
    result.ok
      ? `${PAGE}?tab=carts&saved=sent`
      : `${PAGE}?tab=carts&error=send&detail=${encodeURIComponent(result.error)}`,
  );
}

/** Run the whole sweep now, so the owner can see it work without waiting. */
export async function runSweepNow(): Promise<void> {
  const me = await requireCapability("reports");
  if (me.role !== "OWNER") redirect(`${PAGE}?tab=settings&error=forbidden`);

  const r = await runRecoverySweep();
  revalidatePath(PAGE);
  redirect(`${PAGE}?tab=settings&saved=sweep&n=${r.sent}&detail=${r.considered}`);
}

/* ---------- Follow-up templates ---------- */

/**
 * The sequence is the shop's marketing voice, so editing it is a Master job -
 * the same bar as the recovery settings above it.
 */
async function requireOwner(): Promise<void> {
  const me = await requireCapability("reports");
  if (me.role !== "OWNER") redirect(`${PAGE}?tab=settings&error=forbidden`);
}

const delayFrom = (fd: FormData): number => {
  const value = Number.parseInt(String(fd.get("delayValue") ?? ""), 10);
  const unit = String(fd.get("delayUnit") ?? "minutes");
  if (!Number.isFinite(value) || value < 0) return 60;
  const minutes =
    unit === "days" ? value * 1440 : unit === "hours" ? value * 60 : value;
  // A step that fires inside five minutes reads as a glitch to the customer,
  // and one beyond a month is past the point anyone remembers the cart.
  return Math.min(43_200, Math.max(5, minutes));
};

export async function saveFollowUp(fd: FormData): Promise<void> {
  await requireOwner();

  const id = String(fd.get("id") ?? "").trim();
  const name = String(fd.get("name") ?? "").trim();
  const subject = String(fd.get("subject") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  const couponCode = String(fd.get("couponCode") ?? "").trim().toUpperCase();
  const enabled = fd.get("enabled") !== null;
  const delayMinutes = delayFrom(fd);

  if (!name) redirect(`${PAGE}?tab=templates&error=1&detail=${encodeURIComponent("Give the template a name.")}`);
  if (!subject) redirect(`${PAGE}?tab=templates&error=1&detail=${encodeURIComponent("An email needs a subject line.")}`);
  if (!body) redirect(`${PAGE}?tab=templates&error=1&detail=${encodeURIComponent("The email body can't be empty.")}`);

  const data = { name, subject, body, couponCode, enabled, delayMinutes };
  if (id) {
    await prisma.cartFollowUp.update({ where: { id }, data });
  } else {
    await prisma.cartFollowUp.create({ data });
  }

  revalidatePath(PAGE);
  redirect(`${PAGE}?tab=templates&saved=1`);
}

export async function toggleFollowUp(fd: FormData): Promise<void> {
  await requireOwner();
  const id = String(fd.get("id") ?? "").trim();
  if (id) {
    const row = await prisma.cartFollowUp.findUnique({ where: { id }, select: { enabled: true } });
    if (row) {
      await prisma.cartFollowUp.update({ where: { id }, data: { enabled: !row.enabled } });
    }
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?tab=templates&saved=1`);
}

export async function duplicateFollowUp(fd: FormData): Promise<void> {
  await requireOwner();
  const id = String(fd.get("id") ?? "").trim();
  const row = id ? await prisma.cartFollowUp.findUnique({ where: { id } }) : null;
  if (row) {
    await prisma.cartFollowUp.create({
      data: {
        name: `${row.name} (copy)`,
        subject: row.subject,
        body: row.body,
        couponCode: row.couponCode,
        delayMinutes: row.delayMinutes,
        // A copy starts switched off: two identical emails going out at the
        // same delay is the one thing nobody wants to discover afterwards.
        enabled: false,
      },
    });
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?tab=templates&saved=1`);
}

export async function deleteFollowUp(fd: FormData): Promise<void> {
  await requireOwner();
  const id = String(fd.get("id") ?? "").trim();
  // Its sends go with it by cascade, so the stats on the other templates are
  // untouched and nothing is left pointing at a template that isn't there.
  if (id) await prisma.cartFollowUp.delete({ where: { id } }).catch(() => undefined);
  revalidatePath(PAGE);
  redirect(`${PAGE}?tab=templates&saved=1`);
}

export async function restoreDefaults(): Promise<void> {
  await requireOwner();
  const added = await restoreDefaultFollowUps();
  revalidatePath(PAGE);
  redirect(`${PAGE}?tab=templates&saved=restored&n=${added}`);
}
