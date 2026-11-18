import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { toSVG } from "bwip-js/node";

/**
 * Time-based one-time passwords (RFC 6238), compatible with Google
 * Authenticator, Authy, 1Password and anything else that reads an otpauth://
 * URI.
 *
 * Hand-rolled rather than pulled from npm: the whole algorithm is HMAC-SHA1
 * over a counter plus a truncation rule, and every line of it is below. That is
 * a smaller surface than another dependency in the auth path.
 */

const DIGITS = 6;
const PERIOD = 30; // seconds
/** How many steps either side of now are accepted, for clock drift. */
const WINDOW = 1;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(): string {
  // 20 bytes = 160 bits, the length RFC 4226 recommends for HMAC-SHA1.
  return base32Encode(randomBytes(20));
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The 6-digit code for one 30-second step. */
export function codeForStep(secret: string, step: number): string {
  const key = base32Decode(secret);

  // 8-byte big-endian counter. Written in two halves because a JS bitwise op
  // would truncate to 32 bits and silently break after 2038.
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  counter.writeUInt32BE(step >>> 0, 4);

  const digest = createHmac("sha1", key).update(counter).digest();

  // Dynamic truncation: the low nibble of the last byte picks the offset.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function currentCode(secret: string, at: Date = new Date()): string {
  return codeForStep(secret, Math.floor(at.getTime() / 1000 / PERIOD));
}

/**
 * Is `token` valid right now? Accepts one step either side, so a code typed as
 * it rolls over still works.
 *
 * Comparison is timing-safe. It is a weak signal with only a million
 * possibilities and a rate limiter in front, but it costs one function call.
 */
export function verifyTotp(
  secret: string,
  token: string,
  at: Date = new Date(),
): boolean {
  const clean = token.replace(/\D/g, "");
  if (clean.length !== DIGITS || !secret) return false;

  const now = Math.floor(at.getTime() / 1000 / PERIOD);
  for (let drift = -WINDOW; drift <= WINDOW; drift++) {
    if (safeEqual(codeForStep(secret, now + drift), clean)) return true;
  }
  return false;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** The URI an authenticator app scans. */
export function otpauthUri(opts: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.account)}`;
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Inline SVG QR code for the enrolment screen. */
export function qrSvg(text: string): string {
  return toSVG({ bcid: "qrcode", text, scale: 4 });
}

/** Human-friendly one-time recovery codes: 10 x "abcd-efgh". */
export function generateRecoveryCodes(count = 10): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
    codes.push(`${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`);
  }
  return codes;
}

export function normaliseRecoveryCode(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}
