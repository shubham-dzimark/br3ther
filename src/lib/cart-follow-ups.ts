import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * The abandoned-cart follow-up sequence.
 *
 * Each step is a template with its own delay, measured from the moment the
 * cart went quiet rather than from the previous email - so disabling the
 * one-day reminder never silently drags the two-day one forward.
 */

/** What a template may refer to, and what the admin's help panel lists. */
export const MERGE_FIELDS = [
  { token: "{{customer.first_name}}", label: "Customer's first name", sample: "Jane" },
  { token: "{{cart.product_names}}", label: "Products left in the cart", sample: "Blue Dream, Sour Diesel" },
  { token: "{{cart.total}}", label: "Cart total", sample: "$84.00" },
  { token: "{{cart.coupon_code}}", label: "This step's discount code", sample: "COMEBACK15" },
  { token: "{{cart.url}}", label: "Link back to the cart", sample: "https://…/cart/recover/…" },
  { token: "{{store.name}}", label: "Your store name", sample: "Br3thr" },
] as const;

export type MergeContext = {
  firstName: string;
  productNames: string;
  total: string;
  couponCode: string;
  recoverUrl: string;
  storeName: string;
};

/**
 * Fill in a template's merge fields.
 *
 * An unrecognised field resolves to an empty string rather than being left
 * alone: a typo should cost a missing word, not send a customer an email with
 * {{cart.totl}} printed in the middle of it.
 */
export function renderMerge(text: string, ctx: MergeContext): string {
  const values: Record<string, string> = {
    "customer.first_name": ctx.firstName,
    "cart.product_names": ctx.productNames,
    "cart.total": ctx.total,
    "cart.coupon_code": ctx.couponCode,
    "cart.url": ctx.recoverUrl,
    "store.name": ctx.storeName,
  };
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

/** A first name to greet someone by, from whatever the cart actually knows. */
export function firstNameFrom(name: string | null | undefined, email: string): string {
  const fromName = (name ?? "").trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() ?? "";
  const word = local.split(/\s+/)[0] ?? "";
  // Only when it reads like a name - "sales42" greeted as "Sales42" is worse
  // than no greeting at all.
  if (/^[a-z]{2,}$/i.test(word)) return word[0].toUpperCase() + word.slice(1).toLowerCase();
  return "there";
}

/**
 * The sequence a new shop starts with: a nudge, a reminder, and a last call
 * carrying a discount. Recreated by "Restore default templates", which adds
 * back only the ones that are missing by name and never touches your own.
 */
export const DEFAULT_FOLLOW_UPS = [
  {
    name: "Nudge after 30 minutes",
    subject: "You left {{cart.product_names}} behind",
    delayMinutes: 30,
    couponCode: "",
    body: `Hi {{customer.first_name}},

You left {{cart.product_names}} in your cart at {{store.name}}. We've saved it, so picking up where you left off takes one click.

If something went wrong at checkout, just reply to this email and we'll sort it out.`,
  },
  {
    name: "Reminder after 1 day",
    subject: "Still interested? Your cart is waiting",
    delayMinutes: 1440,
    couponCode: "",
    body: `Hi {{customer.first_name}},

Your cart is still here, {{cart.total}} in total. We hold items while stock lasts, so this is a good moment to finish up if you still want them.

Everything ships discreetly, and tracking arrives by email the moment it goes out.`,
  },
  {
    name: "Last call after 2 days",
    subject: "Last chance - a discount on the cart you left",
    delayMinutes: 2880,
    couponCode: "",
    body: `Hi {{customer.first_name}},

A few days ago you left {{cart.product_names}} in your cart.

To help make up your mind, here's a discount code you can use on this order: {{cart.coupon_code}}

This is a one-time offer. If you'd rather not hear about this cart again, the unsubscribe link below stops these emails for good.`,
  },
] as const;

export type FollowUpRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
  delayMinutes: number;
  enabled: boolean;
  couponCode: string;
  sent: number;
  clicked: number;
  converted: number;
  revenueCents: number;
};

/** Every template with its counts, newest step last. */
export async function listFollowUps(): Promise<FollowUpRow[]> {
  const rows = await prisma.cartFollowUp.findMany({
    orderBy: { delayMinutes: "asc" },
    include: { sends: { select: { clickedAt: true, convertedAt: true, revenueCents: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    subject: r.subject,
    body: r.body,
    delayMinutes: r.delayMinutes,
    enabled: r.enabled,
    couponCode: r.couponCode,
    sent: r.sends.length,
    clicked: r.sends.filter((s) => s.clickedAt).length,
    converted: r.sends.filter((s) => s.convertedAt).length,
    revenueCents: r.sends.reduce((n, s) => n + (s.revenueCents ?? 0), 0),
  }));
}

/** Adds back any default template that is missing, by name. Yours are left alone. */
export async function restoreDefaultFollowUps(): Promise<number> {
  const existing = await prisma.cartFollowUp.findMany({ select: { name: true } });
  const have = new Set(existing.map((r) => r.name));
  const missing = DEFAULT_FOLLOW_UPS.filter((d) => !have.has(d.name));
  if (missing.length === 0) return 0;
  await prisma.cartFollowUp.createMany({ data: missing.map((d) => ({ ...d })) });
  return missing.length;
}

/**
 * Credit a recovered cart to the follow-up that brought it back.
 *
 * Last touch, deliberately: only the most recent email is credited, so a cart
 * that received three of them adds one conversion and one lot of revenue to
 * the sequence rather than three. Anything else makes the totals on this page
 * add up to more money than the shop took.
 */
export async function markFollowUpsConverted(
  cartId: string,
  orderId: string,
  revenueCents: number,
): Promise<void> {
  const last = await prisma.cartFollowUpSend.findFirst({
    where: { cartId, convertedAt: null },
    orderBy: { sentAt: "desc" },
    select: { id: true },
  });
  if (!last) return;
  await prisma.cartFollowUpSend.update({
    where: { id: last.id },
    data: { convertedAt: new Date(), orderId, revenueCents },
  });
}

/** Stamp the click when a recovery link is opened. Unknown ids are ignored. */
export async function markFollowUpClicked(sendId: string): Promise<void> {
  if (!/^[a-z0-9]{10,40}$/i.test(sendId)) return;
  await prisma.cartFollowUpSend
    .updateMany({ where: { id: sendId, clickedAt: null }, data: { clickedAt: new Date() } })
    .catch(() => undefined);
}

/** "30 minutes", "1 day", "2 days" - how the sequence reads in the table. */
export function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes < 1440) {
    const hours = Math.round((minutes / 60) * 10) / 10;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round((minutes / 1440) * 10) / 10;
  return `${days} day${days === 1 ? "" : "s"}`;
}
