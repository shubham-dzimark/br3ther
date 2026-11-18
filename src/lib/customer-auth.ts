import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSecurityConfig } from "@/lib/login-guard";

const COOKIE_NAME = "nl_customer_session";
/** Used only if the stored settings are unreadable. */
const FALLBACK = { customerSessionDays: 7, customerIdleHours: 2 };
/** expiresAt is pushed forward at most this often, so page views aren't all writes. */
const SLIDE_EVERY_MS = 60_000;

async function limits(): Promise<{ capMs: number; idleMs: number }> {
  const c = await getSecurityConfig().catch(() => FALLBACK);
  return {
    capMs: c.customerSessionDays * 864e5,
    idleMs: c.customerIdleHours * 36e5,
  };
}

/**
 * The next deadline for a customer session: idle limit from now, but never
 * past the hard cap counted from sign-in.
 */
function nextExpiry(createdAt: Date, l: { capMs: number; idleMs: number }): Date {
  return new Date(Math.min(Date.now() + l.idleMs, createdAt.getTime() + l.capMs));
}

export type StoreCustomer = {
  id: string;
  email: string;
  name: string | null;
  referralCode: string | null;
  creditCents: number;
};

export async function hashCustomerPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyCustomerPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Only the SHA-256 of the token is stored, as with admin sessions. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createCustomerSession(
  customerId: string,
  meta: { ipAddress?: string; userAgent?: string } = {},
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  /*
   * expiresAt doubles as the idle deadline: it starts at the idle limit and is
   * pushed forward on each use (getCurrentCustomer), up to the hard cap. That
   * gives customers an idle timeout without a new column.
   */
  const expiresAt = nextExpiry(new Date(), await limits());

  await prisma.customerSession.create({
    data: {
      tokenHash: hashToken(token),
      customerId,
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });

  const store = await cookies();
  /*
   * A session cookie - no expires, so closing the browser signs the customer
   * out. The database row still carries expiresAt as a hard server-side cap,
   * so a token that somehow outlives the browser is refused anyway; the two
   * work together rather than one replacing the other.
   */
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function getCurrentCustomer(): Promise<StoreCustomer | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.customerSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { customer: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    // Idle too long or past the cap: remove it rather than leave it lying around.
    await prisma.customerSession
      .delete({ where: { id: session.id } })
      .catch(() => undefined);
    return null;
  }

  /*
   * Sliding idle window. Older sessions were issued with a flat 30 days;
   * the first use after this change pulls them in to the new limits too,
   * since the cap is counted from createdAt.
   */
  const l = await limits();
  const next = nextExpiry(session.createdAt, l);
  if (next.getTime() <= Date.now()) {
    await prisma.customerSession
      .delete({ where: { id: session.id } })
      .catch(() => undefined);
    return null;
  }
  if (Math.abs(next.getTime() - session.expiresAt.getTime()) > SLIDE_EVERY_MS) {
    await prisma.customerSession
      .update({ where: { id: session.id }, data: { expiresAt: next } })
      .catch(() => undefined);
  }

  return {
    id: session.customer.id,
    email: session.customer.email,
    name: session.customer.name,
    referralCode: session.customer.referralCode,
    creditCents: session.customer.creditCents,
  };
}

export async function destroyCustomerSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.customerSession
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => undefined);
  }
  store.delete(COOKIE_NAME);
}

export async function requireCustomer(): Promise<StoreCustomer> {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/account/login");
  return customer;
}

/** Short, unambiguous referral codes customers can read out loud. */
export function generateReferralCode(name: string | null): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const prefix = (name ?? "NL")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(2, "X");
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}-${suffix}`;
}
