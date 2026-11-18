import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { requestFingerprint, ipAllowed, parseIpRules } from "@/lib/client-ip";
import type { LoginKind } from "@/generated/prisma";

/**
 * Brute-force protection and the sign-in audit trail.
 *
 * Two separate jobs that share one table, because they need the same data:
 * "how many times has this email/IP failed recently" is both the throttle input
 * and the thing the store owner wants to look at.
 *
 * Counting is done in Postgres rather than in memory on purpose. An in-process
 * Map is reset by every deploy and every restart, which is exactly when an
 * attacker's run would otherwise be interrupted - and it would not survive
 * running more than one Node process later.
 */

export type SecurityConfig = {
  maxAttempts: number;
  windowMinutes: number;
  lockoutMinutes: number;
  /** Admin: a sign-in never lasts longer than this, however busy. */
  sessionHours: number;
  /** Admin: signed out after this long without a click, key or scroll. */
  idleMinutes: number;
  customerSessionDays: number;
  customerIdleHours: number;
  adminIpRules: string[];
  alertNewIp: boolean;
  geoLookup: boolean;
  require2fa: boolean;
  logRetentionDays: number;
  throttleCustomers: boolean;
};

const num = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const on = (v: string | undefined, fallback = false) =>
  v === undefined || v === "" ? fallback : v === "1";

export async function getSecurityConfig(): Promise<SecurityConfig> {
  const s = await getSettings();
  return {
    maxAttempts: num(s[SETTING_KEYS.secMaxAttempts], 8, 3, 100),
    windowMinutes: num(s[SETTING_KEYS.secWindowMinutes], 15, 1, 1440),
    lockoutMinutes: num(s[SETTING_KEYS.secLockoutMinutes], 15, 1, 1440),
    /*
     * No "never" option on either idle limit, on purpose. The old setting
     * allowed 0 and shipped as 0, which is how a single admin sign-in stayed
     * open for a full week.
     */
    sessionHours: num(s[SETTING_KEYS.secSessionHours], 12, 1, 24),
    idleMinutes: num(s[SETTING_KEYS.secIdleMinutes], 30, 5, 480),
    customerSessionDays: num(s[SETTING_KEYS.secCustomerSessionDays], 7, 1, 30),
    customerIdleHours: num(s[SETTING_KEYS.secCustomerIdleHours], 2, 1, 72),
    adminIpRules: parseIpRules(s[SETTING_KEYS.secAdminIpAllowlist] ?? ""),
    alertNewIp: on(s[SETTING_KEYS.secAlertNewIp], true),
    geoLookup: on(s[SETTING_KEYS.secGeoLookup], true),
    require2fa: on(s[SETTING_KEYS.secRequire2fa]),
    logRetentionDays: num(s[SETTING_KEYS.secLogRetentionDays], 90, 1, 3650),
    throttleCustomers: on(s[SETTING_KEYS.secThrottleCustomers], true),
  };
}

export type GateResult =
  | { blocked: false }
  | { blocked: true; retryAfterMinutes: number; reason: "rate" | "ip" };

/**
 * Called before any password is checked.
 *
 * Both the email and the IP are counted, and either one tripping is enough:
 * counting only the email lets a botnet spray one password across every
 * account, and counting only the IP lets a distributed attacker walk past.
 */
export async function checkLoginGate(opts: {
  kind: LoginKind;
  email: string;
  config?: SecurityConfig;
}): Promise<GateResult> {
  const config = opts.config ?? (await getSecurityConfig());
  const { ip } = await requestFingerprint();

  // The allowlist, when set, applies before anything else - an address that is
  // not on it never gets to try a password at all.
  if (opts.kind === "ADMIN" && !ipAllowed(ip, config.adminIpRules)) {
    return { blocked: true, retryAfterMinutes: 0, reason: "ip" };
  }

  if (opts.kind === "CUSTOMER" && !config.throttleCustomers) {
    return { blocked: false };
  }

  const since = new Date(Date.now() - config.windowMinutes * 60_000);
  const email = opts.email.trim().toLowerCase();

  const [byEmail, byIp] = await Promise.all([
    email
      ? prisma.loginAttempt.count({
          where: { kind: opts.kind, email, success: false, createdAt: { gte: since } },
        })
      : Promise.resolve(0),
    ip
      ? prisma.loginAttempt.count({
          where: { kind: opts.kind, ip, success: false, createdAt: { gte: since } },
        })
      : Promise.resolve(0),
  ]);

  // The IP allowance is deliberately looser: one office NAT can hold a whole
  // team, and locking all of them out because one person fat-fingered a
  // password three times would be its own outage.
  if (byEmail >= config.maxAttempts || byIp >= config.maxAttempts * 3) {
    return {
      blocked: true,
      retryAfterMinutes: config.lockoutMinutes,
      reason: "rate",
    };
  }

  return { blocked: false };
}

export type AttemptReason =
  | "ok"
  | "bad_password"
  | "unknown_user"
  | "inactive"
  | "locked"
  | "ip_blocked"
  | "bad_totp"
  | "recovery_code"
  /// A request to re-send a receipt link. Shares the sign-in counter so the
  /// form cannot be turned into a mailbox flood or an address oracle.
  | "receipt_link"
  /// A password-reset request. Counted so repeated asking reaches the limit.
  | "reset_request"
  /// A guest-account claim email. Same counter, same reason.
  | "claim_request";

/**
 * Write one row of the audit trail. Never throws: a logging failure must not be
 * able to stop someone signing in, nor turn a rejected password into a 500.
 */
export async function recordAttempt(opts: {
  kind: LoginKind;
  email: string;
  success: boolean;
  reason: AttemptReason;
  adminUserId?: string | null;
}): Promise<void> {
  try {
    const { ip, userAgent } = await requestFingerprint();
    const row = await prisma.loginAttempt.create({
      data: {
        kind: opts.kind,
        email: opts.email.trim().toLowerCase().slice(0, 320),
        ip,
        userAgent,
        success: opts.success,
        reason: opts.reason,
        adminUserId: opts.adminUserId ?? null,
      },
      select: { id: true },
    });

    // Location is resolved after the row exists, so a slow or dead geo service
    // can never delay a sign-in.
    if (ip) void fillLocation(row.id, ip);
  } catch (err) {
    console.error("[security] could not record login attempt:", err);
  }
}

/** Best-effort reverse geo. Failure is silent and simply leaves the columns null. */
async function fillLocation(attemptId: string, ip: string): Promise<void> {
  try {
    const config = await getSecurityConfig();
    if (!config.geoLookup) return;
    if (isPrivate(ip)) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return;
    const data = (await res.json()) as {
      success?: boolean;
      country?: string;
      city?: string;
    };
    if (!data?.success) return;

    await prisma.loginAttempt.update({
      where: { id: attemptId },
      data: {
        country: data.country?.slice(0, 80) ?? null,
        city: data.city?.slice(0, 120) ?? null,
      },
    });
  } catch {
    // Deliberately swallowed - this is decoration on an audit row.
  }
}

function isPrivate(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^f[cd]/i.test(ip)
  );
}

/** Trim the trail to the configured retention. Called opportunistically. */
export async function pruneLoginAttempts(days?: number): Promise<number> {
  const keep = days ?? (await getSecurityConfig()).logRetentionDays;
  const cutoff = new Date(Date.now() - keep * 24 * 60 * 60 * 1000);
  const { count } = await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}

/**
 * Has this admin signed in from this IP before? Drives the "new location"
 * email.
 *
 * MUST be called before recordAttempt() and createSession(), or the rows just
 * written would themselves count as prior sightings and nothing would ever
 * look new.
 *
 * "Known place" is judged from two independent sources: successful sign-ins in
 * the audit log, and the IPs on the account's live sessions. Sessions matter
 * because the log is prunable - relying on the log alone meant that clearing
 * it made every location look unknown, and (worse) made the account look like
 * it had never signed in at all, which suppressed the alert entirely.
 */
export async function isNewLocation(
  adminUserId: string,
  ip: string | null,
): Promise<boolean> {
  if (!ip) return false;

  const [seenInLog, seenInSessions, priorSuccesses, user] = await Promise.all([
    prisma.loginAttempt.count({ where: { adminUserId, ip, success: true } }),
    prisma.adminSession.count({ where: { adminUserId, ipAddress: ip } }),
    prisma.loginAttempt.count({ where: { adminUserId, success: true } }),
    prisma.adminUser.findUnique({
      where: { id: adminUserId },
      select: { lastLoginAt: true },
    }),
  ]);

  // Somewhere this account has been before.
  if (seenInLog > 0 || seenInSessions > 0) return false;

  /*
   * A genuinely first-ever sign-in has nothing to compare against, so alerting
   * would be noise on day one. lastLoginAt is the deciding evidence: it is a
   * column on the account rather than a prunable row, so an account that has
   * signed in before still counts as established even with an empty log.
   */
  const firstEver = priorSuccesses === 0 && !user?.lastLoginAt;
  return !firstEver;
}
