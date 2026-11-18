import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { subscribeFromSpin } from "@/lib/promo-actions";

/**
 * Picks the winning segment.
 *
 * The server chooses, never the browser: a wheel whose outcome is decided in
 * client JavaScript can be re-rolled from the console until it lands on the
 * best prize. The browser is told which index won and only animates to it.
 *
 * The response deliberately carries no information about the other segments'
 * weights, so the odds cannot be read off a single request.
 */
export async function POST(request: Request) {
  const settings = await getSettings();
  if (settings[SETTING_KEYS.spinEnabled] !== "1") {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  const prizes = await prisma.spinPrize.findMany({
    where: { isActive: true, weight: { gt: 0 } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, label: true, couponCode: true, weight: true },
  });
  if (prizes.length === 0) {
    return NextResponse.json({ error: "no-prizes" }, { status: 409 });
  }

  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    if (typeof body.email === "string") email = body.email.trim();
  } catch {
    // No body is fine - email is optional unless the shop requires it.
  }

  const needsEmail = settings[SETTING_KEYS.spinEmailRequired] === "1";
  const looksLikeEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  if (needsEmail && !looksLikeEmail) {
    return NextResponse.json({ error: "email-required" }, { status: 400 });
  }

  /* Weighted pick. Integer maths on the running total rather than floats, so
     a long tail of small weights still adds up to exactly the total. */
  const total = prizes.reduce((n, p) => n + p.weight, 0);
  let roll = Math.floor(Math.random() * total);
  let index = prizes.length - 1;
  for (let i = 0; i < prizes.length; i++) {
    roll -= prizes[i].weight;
    if (roll < 0) {
      index = i;
      break;
    }
  }
  const won = prizes[index];

  /* An address given here is a real signup: same list, same unsubscribe link
     as the footer form, tagged with its own source. A failure to record it
     must not cost the shopper the prize they just won. */
  if (looksLikeEmail) {
    try {
      await subscribeFromSpin(email);
    } catch {
      // Ignored on purpose: the spin has already been decided.
    }
  }

  /* The coupon is only reported if it actually exists and is usable - a wheel
     that hands out a code checkout then rejects is worse than no wheel. */
  const coupon = await prisma.coupon.findUnique({
    where: { code: won.couponCode },
    select: { code: true, isActive: true, endsAt: true },
  });
  const usable =
    !!coupon && coupon.isActive && (!coupon.endsAt || coupon.endsAt.getTime() > Date.now());

  return NextResponse.json({
    index,
    label: won.label,
    code: usable ? won.couponCode : null,
  });
}
