"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, revokeAllSessions, revokeSession } from "@/lib/auth";
import { generateSecret } from "@/lib/totp";
import {
  confirmEnrolment,
  disableTwoFactor,
  stageSecret,
} from "@/lib/two-factor";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";

const PAGE = "/admin/profile/security";

/** Step one: mint a secret and show the QR. 2FA is not on yet at this point. */
export async function beginEnrolment(): Promise<void> {
  const me = await requireAdmin({ allowUnenrolled: true });
  await stageSecret(me.id, generateSecret());
  revalidatePath(PAGE);
  redirect(`${PAGE}?setup=1`);
}

export async function cancelEnrolment(): Promise<void> {
  const me = await requireAdmin({ allowUnenrolled: true });
  const user = await prisma.adminUser.findUnique({
    where: { id: me.id },
    select: { totpEnabledAt: true },
  });
  // Only clears a half-finished setup; never disables working 2FA.
  if (!user?.totpEnabledAt) await disableTwoFactor(me.id);
  revalidatePath(PAGE);
  redirect(PAGE);
}

/** Step two: prove the app holds the secret, and collect the recovery codes. */
export async function confirmEnrolmentAction(fd: FormData): Promise<void> {
  const me = await requireAdmin({ allowUnenrolled: true });
  const result = await confirmEnrolment(me.id, String(fd.get("code") ?? ""));

  if (!result.ok) redirect(`${PAGE}?setup=1&error=code`);

  revalidatePath(PAGE);
  /*
   * The codes travel back in the URL because they exist for exactly one render
   * - only their hashes are stored, so there is no second chance to show them.
   * The admin is told to write them down before leaving the page.
   */
  redirect(`${PAGE}?codes=${encodeURIComponent(result.recoveryCodes.join(","))}`);
}

/** Turning 2FA off needs the password: a borrowed session must not be enough. */
export async function disableTwoFactorAction(fd: FormData): Promise<void> {
  const me = await requireAdmin();
  const password = String(fd.get("password") ?? "");

  const user = await prisma.adminUser.findUnique({
    where: { id: me.id },
    select: { passwordHash: true },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect(`${PAGE}?error=password`);
  }

  await disableTwoFactor(me.id);
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=off`);
}

export async function revokeOwnSession(fd: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(fd.get("sessionId") ?? "");

  // Revoking the session you are on is just a sign-out; treat it as one rather
  // than leaving the browser holding a cookie for a row that no longer exists.
  if (id === me.sessionId) {
    await revokeSession(me.id, id);
    redirect("/admin/login");
  }

  await revokeSession(me.id, id);
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=revoked`);
}

export async function revokeOtherSessions(): Promise<void> {
  const me = await requireAdmin();
  const count = await revokeAllSessions(me.id, me.sessionId);
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=all&detail=${count}`);
}
