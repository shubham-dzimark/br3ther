import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSecurityConfig } from "@/lib/login-guard";
import type { AdminRole } from "@/generated/prisma";

const COOKIE_NAME = "nl_admin_session";
/** Used only if the stored settings are unreadable. */
const FALLBACK = { sessionHours: 12, idleMinutes: 30 };

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  /** The session this request arrived on, so it can be excluded from a purge. */
  sessionId: string;
  /** Null until the account has set up an authenticator. */
  totpEnabledAt: Date | null;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Only the SHA-256 of the token is stored. A database leak therefore does not
// hand out usable session cookies.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  adminUserId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const { sessionHours } = await sessionLimits();
  const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);

  await prisma.adminSession.create({
    data: {
      tokenHash: hashToken(token),
      adminUserId,
      expiresAt,
      ipAddress: meta.ipAddress ?? undefined,
      userAgent: meta.userAgent ?? undefined,
    },
  });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    // "strict" would sign the admin out every time they followed a link into
    // the panel from an email; "lax" still blocks the cross-site POST that
    // CSRF needs.
    sameSite: "lax",
    path: "/",
    /*
     * No expires and no maxAge: a browser-session cookie, so closing the
     * browser signs the admin out. It used to carry the 7-day expiry, which
     * made the browser keep it on disk through restarts. The hard limit lives
     * on the server instead (expiresAt above), where it cannot be edited.
     */
  });
}

async function sessionLimits(): Promise<{ sessionHours: number; idleMinutes: number }> {
  try {
    const c = await getSecurityConfig();
    return { sessionHours: c.sessionHours, idleMinutes: c.idleMinutes };
  } catch {
    return FALLBACK;
  }
}

type LiveSession = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

async function loadSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { adminUser: true },
  });

  if (!session || session.expiresAt < new Date()) return null;
  if (!session.adminUser.isActive) return null;

  /*
   * Idle timeout, always on. An absolute expiry does nothing for the real
   * risk here - a signed-in laptop left open somewhere - so a session nobody
   * has used for the configured minutes is deleted outright.
   *
   * "Used" means a person did something: lastSeenAt is written only by the
   * admin page's activity ping (see touchSession) and at sign-in. Page
   * renders do not count, because the admin re-renders itself in the
   * background - chat polling and the notification bell call router.refresh()
   * - and that alone would keep an abandoned session alive forever.
   */
  const { idleMinutes } = await sessionLimits();
  if (Date.now() - session.lastSeenAt.getTime() > idleMinutes * 60 * 1000) {
    await prisma.adminSession
      .delete({ where: { id: session.id } })
      .catch(() => undefined);
    return null;
  }

  return session;
}

/** When this session will end on its own: idle deadline or hard cap, whichever is first. */
async function endsAt(session: { lastSeenAt: Date; expiresAt: Date }): Promise<Date> {
  const { idleMinutes } = await sessionLimits();
  const idleEnd = session.lastSeenAt.getTime() + idleMinutes * 60 * 1000;
  return new Date(Math.min(idleEnd, session.expiresAt.getTime()));
}

export type SessionStatus = {
  /** Milliseconds until sign-out if nobody does anything. */
  remainingMs: number;
  idleMinutes: number;
};

/**
 * The admin page reports real use here (a click, a key, a scroll), at most
 * every half minute. `touch: false` only reads - a second tab asks this
 * before warning, so it doesn't sign out a session another tab is using.
 */
export async function touchSession(opts: { touch: boolean }): Promise<SessionStatus | null> {
  const session: LiveSession | null = await loadSession();
  if (!session) return null;

  let lastSeenAt = session.lastSeenAt;
  if (opts.touch) {
    lastSeenAt = new Date();
    await prisma.adminSession
      .update({ where: { id: session.id }, data: { lastSeenAt } })
      .catch(() => undefined);
  }

  const end = await endsAt({ lastSeenAt, expiresAt: session.expiresAt });
  const { idleMinutes } = await sessionLimits();
  return { remainingMs: Math.max(0, end.getTime() - Date.now()), idleMinutes };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await loadSession();
  if (!session) return null;

  return {
    id: session.adminUser.id,
    email: session.adminUser.email,
    name: session.adminUser.name,
    totpEnabledAt: session.adminUser.totpEnabledAt ?? null,
    role: session.adminUser.role,
    sessionId: session.id,
  };
}

/** Every live session for one admin, newest first. Powers the security page. */
export async function listSessions(adminUserId: string) {
  return prisma.adminSession.findMany({
    where: { adminUserId, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      lastSeenAt: true,
      createdAt: true,
      expiresAt: true,
    },
  });
}

/** Revoke one session. Scoped to the owner so nobody can guess another's id. */
export async function revokeSession(
  adminUserId: string,
  sessionId: string,
): Promise<number> {
  const { count } = await prisma.adminSession.deleteMany({
    where: { id: sessionId, adminUserId },
  });
  return count;
}

/**
 * Sign out everywhere. `exceptSessionId` keeps the session doing the revoking
 * alive, so the button does not also log you out of the page you clicked it on.
 */
export async function revokeAllSessions(
  adminUserId: string,
  exceptSessionId?: string,
): Promise<number> {
  const { count } = await prisma.adminSession.deleteMany({
    where: {
      adminUserId,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
  });
  return count;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.adminSession
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => undefined);
  }
  store.delete(COOKIE_NAME);
}

/** Use in every protected admin server component. Redirects when signed out. */
/**
 * The signed-in admin, or the login page.
 *
 * When the shop requires two-factor and this account has not enrolled, the
 * only thing it may reach is the enrolment screen. Sign-in used to redirect
 * there and stop, which a user could simply navigate away from - the session
 * was already a full one. Enforcing it here means every protected page, server
 * action and admin API inherits the rule.
 *
 * `allowUnenrolled` exists for the enrolment page itself and the actions that
 * complete it; without it, that page would redirect to itself forever.
 */
/**
 * The signed-in admin for an API route, or null.
 *
 * Same enrolment rule as requireAdmin, but it returns null instead of
 * redirecting - a fetch() wants a 401, not an HTML login page. Route handlers
 * that called getSessionUser directly were skipping the mandatory-two-factor
 * check entirely, so an unenrolled admin kept full API access on a shop that
 * had turned the requirement on.
 */
export async function getApiAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;

  if (!user.totpEnabledAt) {
    const config = await getSecurityConfig().catch(() => null);
    if (config?.require2fa) return null;
  }
  return user;
}

export async function requireAdmin(
  opts: { allowUnenrolled?: boolean } = {},
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  if (!opts.allowUnenrolled && !user.totpEnabledAt) {
    const config = await getSecurityConfig().catch(() => null);
    if (config?.require2fa) redirect("/admin/profile/security?enrol=required");
  }

  return user;
}
