"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getLoyaltyConfig } from "@/lib/loyalty";
import type { ReferralStatus } from "@/generated/prisma";

const STATUSES = ["PENDING", "QUALIFIED", "REWARDED", "CANCELLED"] as const;

/** Pay a referral by hand — for cases the automatic rule didn't cover. */
export async function payReferral(fd: FormData): Promise<void> {
  await requireCapability("customers");

  const id = String(fd.get("id") ?? "");
  if (!id) redirect("/admin/referrals");

  const event = await prisma.referralEvent.findUnique({ where: { id } });
  if (!event || event.status === "REWARDED") {
    redirect("/admin/referrals?error=already");
  }

  // A guest checkout record (no account) never collects points, even by hand.
  const referrer = await prisma.customer.findUnique({
    where: { id: event.referrerId },
    select: { passwordHash: true },
  });
  if (!referrer?.passwordHash) redirect("/admin/referrals?error=guest");

  const config = await getLoyaltyConfig();
  const points = Math.max(
    0,
    Math.round(Number(String(fd.get("points") ?? "")) || config.referralPoints),
  );
  if (points <= 0) redirect("/admin/referrals?error=points");

  await prisma.$transaction([
    prisma.loyaltyTransaction.create({
      data: {
        customerId: event.referrerId,
        points,
        type: "EARNED",
        note: `Referral reward (${event.referredEmail}) — paid manually`,
        orderId: event.orderId,
      },
    }),
    prisma.customer.update({
      where: { id: event.referrerId },
      data: { pointsBalance: { increment: points } },
    }),
    prisma.referralEvent.update({
      where: { id },
      data: {
        status: "REWARDED",
        rewardCents: Math.round((points / config.redeemRate) * 100),
      },
    }),
  ]);

  revalidatePath("/admin/referrals");
  redirect("/admin/referrals?saved=1");
}

export async function setReferralStatus(fd: FormData): Promise<void> {
  await requireCapability("customers");
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!id || !(STATUSES as readonly string[]).includes(status)) {
    redirect("/admin/referrals");
  }

  // Rewarding must go through payReferral so points are actually credited.
  if (status === "REWARDED") redirect("/admin/referrals?error=use_pay");

  await prisma.referralEvent.update({
    where: { id },
    data: { status: status as ReferralStatus },
  });

  revalidatePath("/admin/referrals");
  redirect("/admin/referrals?saved=1");
}
