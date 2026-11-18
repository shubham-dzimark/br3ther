import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/*
 * Verified claiming of a guest account.
 *
 * Guest checkout leaves a passwordless customer record. Registering with that
 * address used to set a password and issue a session immediately, which handed
 * the order history to anyone who knew the address. Now the password is held
 * here until a link sent to that address is opened.
 */

const CLAIM_HOURS = 2;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createClaimToken(opts: {
  customerId: string;
  pendingPasswordHash: string;
  pendingName?: string | null;
  pendingReferredBy?: string | null;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");

  /*
   * Supersede any outstanding claim for this account rather than deleting it:
   * a deleted row cannot be counted, and the throttle needs a record that the
   * request happened. Marked used, so it can no longer be redeemed.
   */
  await prisma.customerVerification.updateMany({
    where: { customerId: opts.customerId, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.customerVerification.create({
    data: {
      tokenHash: hash(token),
      customerId: opts.customerId,
      pendingPasswordHash: opts.pendingPasswordHash,
      pendingName: opts.pendingName ?? null,
      pendingReferredBy: opts.pendingReferredBy ?? null,
      expiresAt: new Date(Date.now() + CLAIM_HOURS * 3600 * 1000),
    },
  });

  return token;
}

/**
 * Is this token still redeemable? Reads only - it never spends the token.
 *
 * Used by the confirmation page so it can show the right thing without
 * consuming the link merely by being looked at.
 */
export async function peekClaimToken(
  token: string,
): Promise<"valid" | "used_or_expired" | "invalid"> {
  if (!token) return "invalid";
  const record = await prisma.customerVerification.findUnique({
    where: { tokenHash: hash(token) },
    select: { usedAt: true, expiresAt: true },
  });
  if (!record) return "invalid";
  if (record.usedAt || record.expiresAt <= new Date()) return "used_or_expired";
  return "valid";
}

export type ClaimResult =
  | { ok: true; customerId: string }
  | { ok: false; reason: "invalid" | "used_or_expired" };

/**
 * Redeem a claim token exactly once.
 *
 * The claim and the password write happen in one transaction, and the claim is
 * a conditional update rather than a read-then-write: two submissions of the
 * same link cannot both succeed, because only one of them updates a row.
 */
export async function consumeClaimToken(token: string): Promise<ClaimResult> {
  if (!token) return { ok: false, reason: "invalid" };

  const record = await prisma.customerVerification.findUnique({
    where: { tokenHash: hash(token) },
    select: {
      id: true,
      customerId: true,
      pendingPasswordHash: true,
      pendingName: true,
      pendingReferredBy: true,
    },
  });
  if (!record) return { ok: false, reason: "invalid" };

  try {
    const claimed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.customerVerification.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      // Somebody else got there first, or it has expired.
      if (count !== 1) return false;

      const existing = await tx.customer.findUnique({
        where: { id: record.customerId },
        select: { name: true, referredByCode: true },
      });

      await tx.customer.update({
        where: { id: record.customerId },
        data: {
          passwordHash: record.pendingPasswordHash,
          name: existing?.name ?? record.pendingName ?? null,
          referredByCode: existing?.referredByCode ?? record.pendingReferredBy ?? null,
        },
      });
      return true;
    });

    return claimed
      ? { ok: true, customerId: record.customerId }
      : { ok: false, reason: "used_or_expired" };
  } catch {
    return { ok: false, reason: "used_or_expired" };
  }
}

/** Housekeeping, so spent and stale claims do not accumulate. */
export async function pruneClaimTokens(): Promise<number> {
  const { count } = await prisma.customerVerification.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date(Date.now() - 7 * 864e5) } },
        { usedAt: { lt: new Date(Date.now() - 7 * 864e5) } },
      ],
    },
  });
  return count;
}
