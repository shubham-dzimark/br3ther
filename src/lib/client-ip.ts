import "server-only";
import { headers } from "next/headers";

/**
 * The real client IP, as far as it can be trusted.
 *
 * This matters more than it looks. `X-Forwarded-For` is a list, and only the
 * entries our own proxy appended are trustworthy - anything a client sends is
 * carried through and lands on the LEFT. Reading `xff.split(",")[0]`, which is
 * the obvious thing to write, therefore records whatever the attacker typed:
 *
 *     curl -H 'X-Forwarded-For: 8.8.8.8' https://br3thr.com/admin/login
 *
 * ...would have been logged as a sign-in attempt from 8.8.8.8. An audit trail
 * that can be written by the person you are auditing is worse than none, so:
 *
 *   1. `X-Real-IP` wins. Apache sets it with `RequestHeader set`, which
 *      REPLACES any client-supplied value, so it cannot be forged.
 *   2. Failing that, take the RIGHTMOST entry of X-Forwarded-For - the one our
 *      proxy appended - not the leftmost.
 *
 * Returns null rather than a bogus value when there is nothing trustworthy.
 */
export function clientIpFrom(h: Headers): string | null {
  const real = h.get("x-real-ip")?.trim();
  if (real && isIp(real)) return normalise(real);

  const xff = h.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    // Rightmost is the hop closest to us; that is the one Apache wrote.
    for (let i = hops.length - 1; i >= 0; i--) {
      if (isIp(hops[i])) return normalise(hops[i]);
    }
  }

  return null;
}

export async function clientIp(): Promise<string | null> {
  return clientIpFrom(await headers());
}

/** IP plus user agent, the pair every session and login attempt is stamped with. */
export async function requestFingerprint(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  return {
    ip: clientIpFrom(h),
    // Truncated: a user agent is display text here, not something to store
    // unbounded from an untrusted source.
    userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
  };
}

function normalise(ip: string): string {
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) reads better as plain IPv4.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  return mapped ? mapped[1] : ip;
}

function isIp(value: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (v4) return v4.slice(1).every((o) => Number(o) <= 255);
  // Loose but sufficient: hex groups and colons, optionally IPv4-mapped.
  return /^[0-9a-f:]+(?:\.\d{1,3}){0,3}$/i.test(value) && value.includes(":");
}

/**
 * Does `ip` fall inside `rule`? Supports a plain address, a CIDR block
 * (203.0.113.0/24) and a trailing wildcard (203.0.113.*).
 * Used by the admin IP allowlist.
 */
export function ipMatches(ip: string, rule: string): boolean {
  const r = rule.trim();
  if (!r) return false;
  if (r === ip) return true;

  if (r.includes("/")) {
    const [base, bitsRaw] = r.split("/");
    const bits = Number.parseInt(bitsRaw, 10);
    const a = toV4(ip);
    const b = toV4(base);
    if (a === null || b === null || !Number.isFinite(bits) || bits < 0 || bits > 32) {
      return false;
    }
    if (bits === 0) return true;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (a & mask) >>> 0 === (b & mask) >>> 0;
  }

  if (r.endsWith("*")) return ip.startsWith(r.slice(0, -1));
  return false;
}

/** Any rule matching lets the address through. An empty list allows everything. */
export function ipAllowed(ip: string | null, rules: string[]): boolean {
  if (rules.length === 0) return true;
  if (!ip) return false;
  return rules.some((r) => ipMatches(ip, r));
}

export function parseIpRules(raw: string): string[] {
  return raw
    .split(/[\s,;\n]+/)
    .map((r) => r.trim())
    .filter(Boolean);
}

function toV4(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
