import "server-only";
import { prisma } from "@/lib/prisma";

/*
 * Points changed by hand in the admin - the Member Points screen and the
 * customer page share this, so both follow the same rules and leave the same
 * audit trail.
 */

/** Large enough for any real goodwill gesture, small enough to catch a typo. */
export const MAX_ADMIN_ADJUST = 1_000_000;

export type AdminAdjustError = "zero" | "too_large" | "below_zero" | "not_found" | "guest";

export type AdminAdjustResult =
  | { ok: true; balance: number; points: number }
  | { ok: false; error: AdminAdjustError };

export const ADMIN_ADJUST_MESSAGES: Record<AdminAdjustError, string> = {
  zero: "Enter a number of points other than zero.",
  too_large: `Adjust by at most ${MAX_ADMIN_ADJUST.toLocaleString("en-CA")} points at a time.`,
  below_zero: "That would take the points balance below zero.",
  not_found: "That member no longer exists.",
  guest: "Guests can't hold points until they create an account.",
};

/**
 * Add (or, with a negative number, remove) points on a member's balance.
 *
 * The balance check and the change are one conditional update, so two admins
 * removing points at the same moment cannot take a balance below zero. Every
 * change writes an ADJUSTED ledger row naming the admin who made it.
 */
export async function adjustPointsByAdmin(input: {
  customerId: string;
  points: number;
  note: string;
  adminName: string;
}): Promise<AdminAdjustResult> {
  const points = Math.trunc(Number(input.points));
  if (!Number.isFinite(points) || points === 0) return { ok: false, error: "zero" };
  if (Math.abs(points) > MAX_ADMIN_ADJUST) return { ok: false, error: "too_large" };

  const reason = input.note.trim().slice(0, 200) || (points > 0 ? "Points added" : "Points removed");
  const note = `${reason} — by ${input.adminName}`.slice(0, 280);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.customer.updateMany({
      where: {
        id: input.customerId,
        // Points are for registered accounts only; a guest record is never changed.
        passwordHash: { not: null },
        ...(points < 0 ? { pointsBalance: { gte: -points } } : {}),
      },
      data: { pointsBalance: { increment: points } },
    });

    if (updated.count === 0) {
      const exists = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, passwordHash: true },
      });
      if (exists && !exists.passwordHash) return { ok: false as const, error: "guest" as const };
      return { ok: false as const, error: exists ? ("below_zero" as const) : ("not_found" as const) };
    }

    await tx.loyaltyTransaction.create({
      data: { customerId: input.customerId, points, type: "ADJUSTED", note },
    });

    const after = await tx.customer.findUnique({
      where: { id: input.customerId },
      select: { pointsBalance: true },
    });
    return { ok: true as const, balance: after?.pointsBalance ?? 0, points };
  });
}
