"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { requestFingerprint } from "@/lib/client-ip";
import {
  checkLoginGate,
  getSecurityConfig,
  isNewLocation,
  recordAttempt,
} from "@/lib/login-guard";
import { sendNewLocationAlert } from "@/lib/security-mail";
import {
  clearChallenge,
  readChallenge,
  startChallenge,
  verifySecondFactor,
} from "@/lib/two-factor";

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/admin/login?error=missing");
  }

  const config = await getSecurityConfig();

  // Throttle first: no password is checked, and no timing is leaked, once an
  // address or account has run out of attempts.
  const gate = await checkLoginGate({ kind: "ADMIN", email, config });
  if (gate.blocked) {
    await recordAttempt({
      kind: "ADMIN",
      email,
      success: false,
      reason: gate.reason === "ip" ? "ip_blocked" : "locked",
    });
    redirect(gate.reason === "ip" ? "/admin/login?error=ip" : "/admin/login?error=locked");
  }

  const user = await prisma.adminUser.findUnique({ where: { email } });

  // Always run a comparison so a missing account and a wrong password take
  // roughly the same time - otherwise the response time leaks which emails exist.
  const hash =
    user?.passwordHash ??
    "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const ok = await verifyPassword(password, hash);

  if (!user || !user.isActive || !ok) {
    await recordAttempt({
      kind: "ADMIN",
      email,
      success: false,
      reason: !user ? "unknown_user" : !user.isActive ? "inactive" : "bad_password",
    });
    redirect("/admin/login?error=invalid");
  }

  /*
   * The password was right, but on a 2FA account that is only half the login.
   * No session is created here - the challenge cookie carries nothing but an
   * account id and an expiry, so a stolen password on its own gets no further
   * than this screen.
   */
  if (user.totpSecret && user.totpEnabledAt) {
    await startChallenge(user.id);
    redirect("/admin/login/verify");
  }

  // An account that has not enrolled yet, on a store that now requires it, is
  // sent to set it up rather than turned away - otherwise flipping the setting
  // locks out everyone at once.
  await completeLogin(user.id, email);

  if (config.require2fa && !user.totpEnabledAt) {
    redirect("/admin/profile/security?enrol=required");
  }
  redirect("/admin");
}

/** Second step: the code from the authenticator app, or a recovery code. */
export async function verifyTwoFactorAction(formData: FormData): Promise<void> {
  const adminUserId = await readChallenge();
  if (!adminUserId) redirect("/admin/login?error=expired");

  const user = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
    select: { email: true, isActive: true },
  });
  if (!user || !user.isActive) {
    await clearChallenge();
    redirect("/admin/login?error=invalid");
  }

  const gate = await checkLoginGate({ kind: "ADMIN", email: user.email });
  if (gate.blocked) {
    await recordAttempt({
      kind: "ADMIN",
      email: user.email,
      success: false,
      reason: "locked",
    });
    redirect("/admin/login?error=locked");
  }

  const code = String(formData.get("code") ?? "");
  const result = await verifySecondFactor(adminUserId, code);

  if (!result.ok) {
    await recordAttempt({
      kind: "ADMIN",
      email: user.email,
      success: false,
      reason: "bad_totp",
    });
    redirect("/admin/login/verify?error=code");
  }

  await clearChallenge();
  await completeLogin(adminUserId, user.email, result.usedRecoveryCode);
  redirect("/admin");
}

/**
 * Everything that happens once identity is settled, whichever path got here:
 * audit row, session, last-login stamp and the new-location alert.
 */
async function completeLogin(
  adminUserId: string,
  email: string,
  usedRecoveryCode = false,
): Promise<void> {
  const { ip, userAgent } = await requestFingerprint();

  // Asked before the success row is written, or that row would itself be the
  // "previous sighting" and no login would ever look new.
  const newLocation = await isNewLocation(adminUserId, ip);

  await recordAttempt({
    kind: "ADMIN",
    email,
    success: true,
    reason: usedRecoveryCode ? "recovery_code" : "ok",
    adminUserId,
  });

  await createSession(adminUserId, { ipAddress: ip, userAgent });

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data: { lastLoginAt: new Date(), lockedUntil: null },
  });

  if (newLocation || usedRecoveryCode) {
    // Fire and forget: nobody waits on SMTP to finish signing in.
    void sendNewLocationAlert({
      adminUserId,
      ip,
      userAgent,
      usedRecoveryCode,
    }).catch(() => undefined);
  }
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}
