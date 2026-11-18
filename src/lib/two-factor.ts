import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSetting } from "@/lib/settings";
import {
  generateRecoveryCodes,
  normaliseRecoveryCode,
  verifyTotp,
} from "@/lib/totp";

/**
 * The gap between "password accepted" and "signed in".
 *
 * When 2FA is on, the password alone must not create a session - but the second
 * step needs to know who is halfway through. That state is held in a signed,
 * short-lived cookie rather than a session row, so a half-finished login has no
 * database presence and, crucially, no authority: the token names an account
 * and an expiry and nothing else, and it is signed so it cannot be edited into
 * naming somebody else's.
 */

const CHALLENGE_COOKIE = "nl_admin_2fa";
const CHALLENGE_MINUTES = 10;
const SECRET_KEY = "security.hmac_secret";

/**
 * The signing key. Kept in StoreSetting and generated on first use, so this
 * works on a fresh install with no extra environment variable to forget. An
 * AUTH_SECRET in the environment overrides it for installs that would rather
 * keep every secret out of the database.
 */
async function signingSecret(): Promise<string> {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;

  const row = await prisma.storeSetting.findUnique({ where: { key: SECRET_KEY } });
  if (row?.value) return row.value;

  const generated = randomBytes(32).toString("hex");
  await setSetting(SECRET_KEY, generated);
  return generated;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function startChallenge(adminUserId: string): Promise<void> {
  const expires = Date.now() + CHALLENGE_MINUTES * 60_000;
  const payload = `${adminUserId}.${expires}`;
  const secret = await signingSecret();

  const store = await cookies();
  store.set(CHALLENGE_COOKIE, `${payload}.${sign(payload, secret)}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expires),
  });
}

/** The admin id a valid, unexpired challenge names, or null. */
export async function readChallenge(): Promise<string | null> {
  const raw = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [adminUserId, expiresRaw, mac] = parts;

  const expires = Number.parseInt(expiresRaw, 10);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;

  const expected = sign(`${adminUserId}.${expiresRaw}`, await signingSecret());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return adminUserId;
}

export async function clearChallenge(): Promise<void> {
  (await cookies()).delete(CHALLENGE_COOKIE);
}

/* ---------- Enrolment ---------- */

/**
 * Stage a secret without turning 2FA on. It only becomes active once a code
 * generated from it verifies, which proves the authenticator actually holds it
 * - otherwise a mistyped setup would lock the account out permanently.
 */
export async function stageSecret(adminUserId: string, secret: string): Promise<void> {
  await prisma.adminUser.update({
    where: { id: adminUserId },
    data: { totpSecret: secret, totpEnabledAt: null },
  });
}

export async function confirmEnrolment(
  adminUserId: string,
  code: string,
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
  const user = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
    select: { totpSecret: true },
  });
  if (!user?.totpSecret || !verifyTotp(user.totpSecret, code)) return { ok: false };

  const recoveryCodes = generateRecoveryCodes();
  const hashes = await Promise.all(
    recoveryCodes.map((c) => bcrypt.hash(normaliseRecoveryCode(c), 10)),
  );

  await prisma.$transaction([
    prisma.adminRecoveryCode.deleteMany({ where: { adminUserId } }),
    prisma.adminRecoveryCode.createMany({
      data: hashes.map((codeHash) => ({ adminUserId, codeHash })),
    }),
    prisma.adminUser.update({
      where: { id: adminUserId },
      data: { totpEnabledAt: new Date() },
    }),
  ]);

  return { ok: true, recoveryCodes };
}

export async function disableTwoFactor(adminUserId: string): Promise<void> {
  await prisma.$transaction([
    prisma.adminRecoveryCode.deleteMany({ where: { adminUserId } }),
    prisma.adminUser.update({
      where: { id: adminUserId },
      data: { totpSecret: null, totpEnabledAt: null },
    }),
  ]);
}

/* ---------- Verification at sign-in ---------- */

/**
 * Check a code from the authenticator, or a recovery code.
 *
 * Recovery codes are single use: a matching one is marked used inside the same
 * call, so the same slip of paper cannot be replayed.
 */
export async function verifySecondFactor(
  adminUserId: string,
  input: string,
): Promise<{ ok: false } | { ok: true; usedRecoveryCode: boolean }> {
  const user = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!user?.totpSecret || !user.totpEnabledAt) return { ok: false };

  const trimmed = input.trim();
  if (verifyTotp(user.totpSecret, trimmed)) {
    return { ok: true, usedRecoveryCode: false };
  }

  const candidate = normaliseRecoveryCode(trimmed);
  if (candidate.length < 6) return { ok: false };

  const unused = await prisma.adminRecoveryCode.findMany({
    where: { adminUserId, usedAt: null },
    select: { id: true, codeHash: true },
  });

  for (const row of unused) {
    if (await bcrypt.compare(candidate, row.codeHash)) {
      await prisma.adminRecoveryCode.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      return { ok: true, usedRecoveryCode: true };
    }
  }

  return { ok: false };
}

export async function recoveryCodesLeft(adminUserId: string): Promise<number> {
  return prisma.adminRecoveryCode.count({ where: { adminUserId, usedAt: null } });
}
