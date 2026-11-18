import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS, setSetting } from "@/lib/settings";
import { getMailConfig, sendMail } from "@/lib/mail";
import { abandonedCartEmail, cartFollowUpEmail } from "@/lib/mail-templates";
import { firstNameFrom, renderMerge } from "@/lib/cart-follow-ups";
import { getMoneyFormatter } from "@/lib/currency";
import { randomBytes } from "node:crypto";

/**
 * Abandoned-cart recovery.
 *
 * A cart counts as abandoned once it has items, an email we can write to, and
 * no activity for the configured delay. Reminders are counted on the cart row,
 * which is what stops the sweep emailing the same person about the same cart
 * every time it runs - the single most common way this feature turns into spam.
 */

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com"
).replace(/\/$/, "");

const UNSUB_SECRET_KEY = "cart.unsub_secret";

export type RecoveryConfig = {
  enabled: boolean;
  delayMinutes: number;
  maxReminders: number;
  intervalHours: number;
  coupon: string;
  couponFrom: number;
};

const num = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export async function getRecoveryConfig(): Promise<RecoveryConfig> {
  const s = await getSettings();
  return {
    enabled: s[SETTING_KEYS.cartRecoveryEnabled] === "1",
    delayMinutes: num(s[SETTING_KEYS.cartRecoveryDelayMinutes], 360, 15, 20160),
    maxReminders: num(s[SETTING_KEYS.cartRecoveryMaxReminders], 2, 1, 5),
    intervalHours: num(s[SETTING_KEYS.cartRecoveryIntervalHours], 24, 1, 336),
    coupon: (s[SETTING_KEYS.cartRecoveryCoupon] ?? "").trim(),
    couponFrom: num(s[SETTING_KEYS.cartRecoveryCouponFrom], 2, 1, 5),
  };
}

/* ---------- Unsubscribe ---------- */

async function unsubSecret(): Promise<string> {
  const row = await prisma.storeSetting.findUnique({ where: { key: UNSUB_SECRET_KEY } });
  if (row?.value) return row.value;
  const generated = randomBytes(32).toString("hex");
  await setSetting(UNSUB_SECRET_KEY, generated);
  return generated;
}

/**
 * A per-address unsubscribe token. Signed rather than stored so every email can
 * carry a working link without a table of one-time tokens, and so the link
 * keeps working however long the mail sits in an inbox.
 */
export async function unsubscribeToken(email: string): Promise<string> {
  const secret = await unsubSecret();
  return createHmac("sha256", secret).update(email.toLowerCase()).digest("hex").slice(0, 32);
}

export async function verifyUnsubscribe(email: string, token: string): Promise<boolean> {
  const expected = await unsubscribeToken(email);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function suppressEmail(email: string, reason = "unsubscribed"): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!clean) return;
  await prisma.emailSuppression.upsert({
    where: { email: clean },
    create: { email: clean, reason },
    update: { reason },
  });
}

export async function isSuppressed(email: string): Promise<boolean> {
  const row = await prisma.emailSuppression.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  return Boolean(row);
}

/* ---------- The sweep ---------- */

export type SweepResult = {
  ok: true;
  considered: number;
  sent: number;
  skipped: { noEmail: number; suppressed: number; failed: number };
};

/**
 * Find and email carts that qualify. Safe to run often - the interval and the
 * per-cart counter decide whether anything actually goes out, not how
 * frequently this is called.
 */
/**
 * How long after its due time a step may still go out, when it is the last one
 * in the sequence. Earlier steps close as soon as the next step opens.
 *
 * Without a closing edge, switching the feature on would mail every step of
 * the sequence, one sweep after another, to carts abandoned months ago. A step
 * that was missed - the cron was down, the shop was closed - is simply skipped.
 */
const LAST_STEP_WINDOW_MINUTES = 72 * 60;

/**
 * The step a cart is due, or null.
 *
 * Each step owns the stretch of time between its own delay and the next
 * step's, so a cart gets the message that matches how long it has actually
 * been sitting there rather than the whole sequence in a burst.
 */
function dueStep<T extends { id: string; delayMinutes: number }>(
  steps: T[],
  idleMinutes: number,
  alreadySent: Set<string>,
): T | null {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const opens = step.delayMinutes;
    const closes = steps[i + 1]
      ? steps[i + 1].delayMinutes
      : step.delayMinutes + LAST_STEP_WINDOW_MINUTES;
    if (idleMinutes >= opens && idleMinutes < closes && !alreadySent.has(step.id)) {
      return step;
    }
  }
  return null;
}

/**
 * Send the follow-up sequence: the admin's own templates, each with its own
 * delay. Falls through to the single built-in reminder below when no template
 * is enabled, so a shop that never opens the templates page keeps working.
 */
async function runSequenceSweep(
  config: RecoveryConfig,
  steps: { id: string; subject: string; body: string; delayMinutes: number; couponCode: string }[],
  limit: number,
): Promise<SweepResult> {
  const result: SweepResult = {
    ok: true,
    considered: 0,
    sent: 0,
    skipped: { noEmail: 0, suppressed: 0, failed: 0 },
  };

  const now = Date.now();
  const earliest = steps[0].delayMinutes;
  const latest = steps[steps.length - 1].delayMinutes + LAST_STEP_WINDOW_MINUTES;

  const carts = await prisma.cart.findMany({
    where: {
      status: { in: ["ACTIVE", "ABANDONED"] },
      itemCount: { gt: 0 },
      lastActivityAt: {
        lt: new Date(now - earliest * 60_000),
        // Past the end of the sequence there is nothing left to send.
        gt: new Date(now - latest * 60_000),
      },
    },
    orderBy: { lastActivityAt: "asc" },
    take: limit,
    include: {
      items: true,
      followUps: { select: { followUpId: true } },
      customer: { select: { name: true } },
    },
  });

  result.considered = carts.length;
  if (carts.length === 0) return result;

  const [mail, money] = await Promise.all([getMailConfig(), getMoneyFormatter()]);
  if (!mail.enabled) return result;

  const storeName = mail.fromName || "Br3thr";

  for (const cart of carts) {
    const email = cart.email?.trim().toLowerCase();
    if (!email) {
      result.skipped.noEmail++;
      continue;
    }
    if (await isSuppressed(email)) {
      result.skipped.suppressed++;
      continue;
    }

    const idleMinutes = (now - cart.lastActivityAt.getTime()) / 60_000;
    const step = dueStep(steps, idleMinutes, new Set(cart.followUps.map((f) => f.followUpId)));
    if (!step) continue;

    const items = cart.items
      .filter((i) => !i.isGift)
      .map((i) => ({
        name: i.nameSnapshot,
        variant: i.variantSnapshot,
        quantity: i.quantity,
        price: money.format(i.unitPriceCents * i.quantity),
      }));

    /*
     * The send is recorded before the mail goes out, not after: the unique
     * (step, cart) pair is what makes a double send impossible, and it can
     * only do that if two overlapping sweeps race for the same row. A failed
     * send deletes it again, so a transient SMTP fault is retried.
     */
    let sendId: string;
    try {
      const row = await prisma.cartFollowUpSend.create({
        data: { followUpId: step.id, cartId: cart.id, email },
        select: { id: true },
      });
      sendId = row.id;
    } catch {
      // Another sweep already claimed this step for this cart.
      continue;
    }

    const coupon = (step.couponCode || config.coupon).trim();
    const ctx = {
      firstName: firstNameFrom(cart.customer?.name, email),
      productNames: items.map((i) => i.name).join(", "),
      total: money.format(cart.subtotalCents),
      couponCode: coupon,
      recoverUrl: `${SITE_URL}/cart/recover/${cart.token}?f=${sendId}`,
      storeName,
    };

    const body = cartFollowUpEmail({
      storeName,
      storeUrl: SITE_URL,
      recoverUrl: ctx.recoverUrl,
      unsubscribeUrl: `${SITE_URL}/unsubscribe?email=${encodeURIComponent(email)}&t=${await unsubscribeToken(email)}`,
      subject: renderMerge(step.subject, ctx),
      bodyText: renderMerge(step.body, ctx),
      items,
      total: ctx.total,
      coupon,
    });

    const sent = await sendMail({ to: email, ...body }, mail);

    if (sent.ok) {
      result.sent++;
      await prisma.cart.update({
        where: { id: cart.id },
        data: {
          remindersSent: { increment: 1 },
          lastReminderAt: new Date(),
          status: "ABANDONED",
        },
      });
    } else {
      result.skipped.failed++;
      console.error(`[cart-recovery] ${email}: ${sent.error}`);
      await prisma.cartFollowUpSend.delete({ where: { id: sendId } });
      await prisma.cart.update({
        where: { id: cart.id },
        data: { lastReminderAt: new Date() },
      });
    }
  }

  return result;
}

export async function runRecoverySweep(opts?: { limit?: number }): Promise<SweepResult> {
  const config = await getRecoveryConfig();
  const result: SweepResult = {
    ok: true,
    considered: 0,
    sent: 0,
    skipped: { noEmail: 0, suppressed: 0, failed: 0 },
  };

  if (!config.enabled) return result;

  const steps = await prisma.cartFollowUp.findMany({
    where: { enabled: true },
    orderBy: { delayMinutes: "asc" },
    select: { id: true, subject: true, body: true, delayMinutes: true, couponCode: true },
  });
  if (steps.length > 0) return runSequenceSweep(config, steps, opts?.limit ?? 50);

  const now = Date.now();
  const idleCutoff = new Date(now - config.delayMinutes * 60_000);
  const intervalCutoff = new Date(now - config.intervalHours * 3600_000);

  const carts = await prisma.cart.findMany({
    where: {
      status: { in: ["ACTIVE", "ABANDONED"] },
      itemCount: { gt: 0 },
      lastActivityAt: { lt: idleCutoff },
      remindersSent: { lt: config.maxReminders },
      // Never two reminders inside one interval, whatever the sweep cadence is.
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: intervalCutoff } }],
    },
    orderBy: { lastActivityAt: "asc" },
    take: opts?.limit ?? 50,
    include: { items: true },
  });

  result.considered = carts.length;
  if (carts.length === 0) return result;

  const [mail, money] = await Promise.all([getMailConfig(), getMoneyFormatter()]);
  if (!mail.enabled) return result;

  for (const cart of carts) {
    // A cart with no address cannot be recovered by email. Counted, so the
    // admin can see how much of the loss is simply unreachable.
    const email = cart.email?.trim().toLowerCase();
    if (!email) {
      result.skipped.noEmail++;
      continue;
    }

    if (await isSuppressed(email)) {
      result.skipped.suppressed++;
      /*
       * Bumped to the maximum rather than left alone: without this the same
       * unsuppressible cart is reconsidered on every single sweep forever.
       */
      await prisma.cart.update({
        where: { id: cart.id },
        data: { remindersSent: config.maxReminders },
      });
      continue;
    }

    const stage = cart.remindersSent + 1;
    const token = await unsubscribeToken(email);

    const body = abandonedCartEmail({
      storeName: mail.fromName || "Br3thr",
      storeUrl: SITE_URL,
      recoverUrl: `${SITE_URL}/cart/recover/${cart.token}`,
      unsubscribeUrl: `${SITE_URL}/unsubscribe?email=${encodeURIComponent(email)}&t=${token}`,
      items: cart.items
        .filter((i) => !i.isGift)
        .map((i) => ({
          name: i.nameSnapshot,
          variant: i.variantSnapshot,
          quantity: i.quantity,
          price: money.format(i.unitPriceCents * i.quantity),
        })),
      total: money.format(cart.subtotalCents),
      stage,
      coupon: config.coupon && stage >= config.couponFrom ? config.coupon : "",
    });

    const sent = await sendMail({ to: email, ...body }, mail);

    if (sent.ok) {
      result.sent++;
      await prisma.cart.update({
        where: { id: cart.id },
        data: {
          remindersSent: { increment: 1 },
          lastReminderAt: new Date(),
          status: "ABANDONED",
        },
      });
    } else {
      result.skipped.failed++;
      console.error(`[cart-recovery] ${email}: ${sent.error}`);
      /*
       * Deliberately not counted as a send, so a transient SMTP failure is
       * retried next sweep - but lastReminderAt is stamped so a permanently
       * broken address cannot be retried in a tight loop.
       */
      await prisma.cart.update({
        where: { id: cart.id },
        data: { lastReminderAt: new Date() },
      });
    }
  }

  return result;
}

/** Send one reminder immediately, from the admin's "Send now" button. */
export async function sendReminderNow(
  cartId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: { items: true, customer: { select: { name: true } } },
  });
  if (!cart) return { ok: false, error: "That cart no longer exists." };

  const email = cart.email?.trim().toLowerCase();
  if (!email) return { ok: false, error: "This cart has no email address to write to." };
  if (await isSuppressed(email)) {
    return { ok: false, error: "That address has unsubscribed from marketing email." };
  }

  const [config, mail, money] = await Promise.all([
    getRecoveryConfig(),
    getMailConfig(),
    getMoneyFormatter(),
  ]);
  if (!mail.enabled) return { ok: false, error: "Outgoing email is switched off." };

  /*
   * With a sequence set up, "Send now" sends the next step this cart has not
   * had rather than the built-in reminder - otherwise the manual button would
   * quietly send different wording from the automatic sweep.
   */
  const steps = await prisma.cartFollowUp.findMany({
    where: { enabled: true },
    orderBy: { delayMinutes: "asc" },
    select: { id: true, subject: true, body: true, couponCode: true },
  });
  if (steps.length > 0) {
    const already = await prisma.cartFollowUpSend.findMany({
      where: { cartId: cart.id },
      select: { followUpId: true },
    });
    const done = new Set(already.map((r) => r.followUpId));
    const step = steps.find((s) => !done.has(s.id));
    if (!step) {
      return { ok: false, error: "This cart has already had every follow-up in the sequence." };
    }

    const items = cart.items
      .filter((i) => !i.isGift)
      .map((i) => ({
        name: i.nameSnapshot,
        variant: i.variantSnapshot,
        quantity: i.quantity,
        price: money.format(i.unitPriceCents * i.quantity),
      }));

    const row = await prisma.cartFollowUpSend.create({
      data: { followUpId: step.id, cartId: cart.id, email },
      select: { id: true },
    });

    const storeName = mail.fromName || "Br3thr";
    const coupon = (step.couponCode || config.coupon).trim();
    const ctx = {
      firstName: firstNameFrom(cart.customer?.name, email),
      productNames: items.map((i) => i.name).join(", "),
      total: money.format(cart.subtotalCents),
      couponCode: coupon,
      recoverUrl: `${SITE_URL}/cart/recover/${cart.token}?f=${row.id}`,
      storeName,
    };

    const built = cartFollowUpEmail({
      storeName,
      storeUrl: SITE_URL,
      recoverUrl: ctx.recoverUrl,
      unsubscribeUrl: `${SITE_URL}/unsubscribe?email=${encodeURIComponent(email)}&t=${await unsubscribeToken(email)}`,
      subject: renderMerge(step.subject, ctx),
      bodyText: renderMerge(step.body, ctx),
      items,
      total: ctx.total,
      coupon,
    });

    const out = await sendMail({ to: email, ...built }, mail);
    if (!out.ok) {
      await prisma.cartFollowUpSend.delete({ where: { id: row.id } });
      return { ok: false, error: out.error };
    }

    await prisma.cart.update({
      where: { id: cart.id },
      data: {
        remindersSent: { increment: 1 },
        lastReminderAt: new Date(),
        status: "ABANDONED",
      },
    });
    return { ok: true };
  }

  const stage = cart.remindersSent + 1;
  const body = abandonedCartEmail({
    storeName: mail.fromName || "Br3thr",
    storeUrl: SITE_URL,
    recoverUrl: `${SITE_URL}/cart/recover/${cart.token}`,
    unsubscribeUrl: `${SITE_URL}/unsubscribe?email=${encodeURIComponent(email)}&t=${await unsubscribeToken(email)}`,
    items: cart.items
      .filter((i) => !i.isGift)
      .map((i) => ({
        name: i.nameSnapshot,
        variant: i.variantSnapshot,
        quantity: i.quantity,
        price: money.format(i.unitPriceCents * i.quantity),
      })),
    total: money.format(cart.subtotalCents),
    stage,
    coupon: config.coupon && stage >= config.couponFrom ? config.coupon : "",
  });

  const sent = await sendMail({ to: email, ...body }, mail);
  if (!sent.ok) return { ok: false, error: sent.error };

  await prisma.cart.update({
    where: { id: cart.id },
    data: {
      remindersSent: { increment: 1 },
      lastReminderAt: new Date(),
      status: "ABANDONED",
    },
  });
  return { ok: true };
}
