import "server-only";
import { prisma } from "@/lib/prisma";

/*
 * "Track your order" for anyone, signed in or not.
 *
 * An order is found only by its number AND the email it was placed with.
 * Numbers are sequential, so the number alone would let anyone page through
 * every order; the email is the proof. A wrong number and a wrong email give
 * the same answer, and each visitor gets a handful of attempts, so the form
 * can't be used to discover which numbers exist.
 */

const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, number[]>();

/** Up to MAX_ATTEMPTS lookups per visitor in ten minutes. */
export function allowTrackAttempt(visitor: string, now = Date.now()): boolean {
  const recent = (attempts.get(visitor) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS) {
    attempts.set(visitor, recent);
    return false;
  }
  recent.push(now);
  attempts.set(visitor, recent);
  if (attempts.size > 5000) {
    for (const [key, times] of attempts) {
      if (!times.some((t) => now - t < WINDOW_MS)) attempts.delete(key);
    }
  }
  return true;
}

/** For tests. */
export function resetTrackAttempts(): void {
  attempts.clear();
}

/**
 * What a customer might type for order 0012: "#0012", "0012", "12",
 * "Order #12", "nl-2026-0012". Returns the stored forms to look for.
 */
export function orderNumberCandidates(raw: string): string[] {
  const cleaned = raw.trim().toUpperCase().replace(/^ORDER\s*/, "").replace(/^#/, "").replace(/\s+/g, "");
  if (!cleaned || cleaned.length > 40) return [];
  const out = new Set<string>([cleaned]);
  if (/^\d+$/.test(cleaned)) {
    const n = String(Number(cleaned));
    out.add(n);
    out.add(n.padStart(4, "0"));
  }
  return [...out];
}

export type StepKey = "placed" | "paid" | "processing" | "shipped" | "delivered";
export type StepState = "done" | "current" | "todo";

const STEP_ORDER: StepKey[] = ["placed", "paid", "processing", "shipped", "delivered"];

/** How far along each status is: the last step that is done. */
const REACHED: Record<string, number> = {
  AWAITING_PAYMENT: 0,
  ON_HOLD: 0,
  PAYMENT_RECEIVED: 1,
  PROCESSING: 2,
  SHIPPED: 3,
  DELIVERED: 4,
};

/**
 * The progress bar for an order, or null for a cancelled or refunded one,
 * which has no forward path to show.
 */
export function trackingSteps(order: {
  status: string;
  createdAt: Date;
  paymentConfirmedAt: Date | null;
  shippedAt: Date | null;
}): { key: StepKey; state: StepState; at: Date | null }[] | null {
  const reached = REACHED[order.status];
  if (reached === undefined) return null;
  const dates: Record<StepKey, Date | null> = {
    placed: order.createdAt,
    paid: order.paymentConfirmedAt,
    processing: null,
    shipped: order.shippedAt,
    delivered: null,
  };
  return STEP_ORDER.map((key, i) => ({
    key,
    state: i <= reached ? "done" : i === reached + 1 ? "current" : "todo",
    at: i <= reached ? dates[key] : null,
  }));
}

/** The order matching both number and email, with only what the page shows. */
export async function findTrackableOrder(numberRaw: string, emailRaw: string) {
  const numbers = orderNumberCandidates(numberRaw);
  const email = emailRaw.trim().toLowerCase();
  if (numbers.length === 0 || !email.includes("@") || email.length > 254) return null;

  return prisma.order.findFirst({
    where: {
      orderNumber: { in: numbers },
      email: { equals: email, mode: "insensitive" },
    },
    select: {
      orderNumber: true,
      status: true,
      createdAt: true,
      paymentConfirmedAt: true,
      shippedAt: true,
      trackingCarrier: true,
      trackingCode: true,
      shipCity: true,
      shipRegion: true,
      totalCents: true,
      currency: true,
      paymentMethodKey: true,
      items: {
        orderBy: { id: "asc" },
        select: { nameSnapshot: true, variantSnapshot: true, quantity: true, isGift: true },
      },
    },
  });
}
