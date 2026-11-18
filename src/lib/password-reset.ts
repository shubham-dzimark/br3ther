import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Customer password resets.
 *
 * Three properties matter here, and each one is a way this goes wrong:
 *
 *   1. The link is single use. Reset emails live in inboxes forever; without
 *      usedAt, anyone who later reads that mailbox owns the account.
 *   2. Only the hash is stored, so the database cannot hand out working links.
 *   3. Asking for a reset never reveals whether an address has an account.
 *      That is enforced at the caller, which always reports success.
 */

const TOKEN_MINUTES = 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mint a reset token. Returns the raw token for the email; it is never stored
 * and cannot be recovered afterwards.
 *
 * Any earlier unused tokens for the same customer are dropped, so asking twice
 * invalidates the first link rather than leaving two live ways in.
 */
export async function createResetToken(
  customerId: string,
  requestedIp?: string | null,
): Promise<string> {
  const token = randomBytes(32).toString("hex");

  await prisma.$transaction([
    /*
     * Superseded links are marked used, not deleted.
     *
     * They stop working either way - lookupResetToken rejects a used token -
     * but keeping the row means "how many resets went to this account lately"
     * is still answerable. Deleting them made that count permanently 1, which
     * silently defeated the throttle that stops the chat assistant being used
     * to flood someone's inbox.
     */
    prisma.passwordResetToken.updateMany({
      where: { customerId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        tokenHash: hashToken(token),
        customerId,
        expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60_000),
        requestedIp: requestedIp ?? undefined,
      },
    }),
  ]);

  return token;
}

export type ResetLookup =
  | { ok: true; tokenId: string; customerId: string; email: string }
  | { ok: false; reason: "unknown" | "expired" | "used" };

/** Validate a token without consuming it - used to render the form. */
export async function lookupResetToken(token: string): Promise<ResetLookup> {
  if (!token || token.length < 32) return { ok: false, reason: "unknown" };

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { customer: { select: { id: true, email: true } } },
  });

  if (!row) return { ok: false, reason: "unknown" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt < new Date()) return { ok: false, reason: "expired" };

  return {
    ok: true,
    tokenId: row.id,
    customerId: row.customer.id,
    email: row.customer.email,
  };
}

/**
 * Set the new password and burn the token.
 *
 * Every existing session for that customer is destroyed at the same time. This
 * is the point of a reset when an account has been taken: changing the password
 * while leaving the attacker's session alive achieves nothing.
 */
/**
 * Redeem a reset token exactly once.
 *
 * The claim is a conditional update - "mark used, but only if still unused and
 * unexpired" - and the password write happens in the same transaction. The
 * previous version marked the row used by id unconditionally, so two
 * submissions of the same link could both pass the earlier lookup and both
 * change the password, last writer winning.
 *
 * Returns false when another request got there first; the caller reports that
 * as an already-used link rather than a silent success.
 */
export async function consumeResetToken(opts: {
  tokenId: string;
  customerId: string;
  passwordHash: string;
}): Promise<boolean> {
  try {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: opts.tokenId, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (count !== 1) return false;

      await tx.customer.update({
        where: { id: opts.customerId },
        data: { passwordHash: opts.passwordHash },
      });
      await tx.customerSession.deleteMany({ where: { customerId: opts.customerId } });
      return true;
    });
  } catch {
    return false;
  }
}

/** Housekeeping: drop tokens that are spent or long expired. */
export async function pruneResetTokens(): Promise<number> {
  const { count } = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        { usedAt: { not: null, lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
    },
  });
  return count;
}
