import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { csvRow } from "@/lib/tracking-csv";
import { getTimeZone, ymd, ymdhm } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/** Same window the screen uses, so the file matches what was listed. */
const ABANDON_AFTER_HOURS = 6;

const HEADERS = [
  "cart_id",
  "email",
  "items",
  "item_count",
  "subtotal",
  "last_activity",
  "reminders_sent",
  "last_reminder",
  "recovered",
] as const;

const amount = (cents: number) => (cents / 100).toFixed(2);

/**
 * Abandoned cart export - the list staff actually work from when chasing
 * recoveries by hand, so it carries the email and what was left behind.
 */
export async function GET(): Promise<Response> {
  const tz = await getTimeZone();
  await requireCapability("reports");

  const cutoff = new Date(Date.now() - ABANDON_AFTER_HOURS * 3600 * 1000);
  const carts = await prisma.cart.findMany({
    where: {
      status: { in: ["ACTIVE", "ABANDONED"] },
      lastActivityAt: { lt: cutoff },
      itemCount: { gt: 0 },
    },
    orderBy: { lastActivityAt: "desc" },
    include: { items: true },
  });

  const body = [
    HEADERS.join(","),
    ...carts.map((c) =>
      csvRow([
        c.id,
        c.email ?? "",
        c.items
          .map(
            (i) =>
              `${[i.nameSnapshot, i.variantSnapshot].filter(Boolean).join(" - ")} x${i.quantity}`,
          )
          .join("; "),
        String(c.itemCount),
        amount(c.subtotalCents),
        ymdhm(c.lastActivityAt, tz),
        String(c.remindersSent),
        c.lastReminderAt
          ? ymdhm(c.lastReminderAt, tz)
          : "",
        c.recoveredAt
          ? ymdhm(c.recoveredAt, tz)
          : "",
      ]),
    ),
  ].join("\n");

  const stamp = ymd(new Date(), tz);
  return new Response(`﻿${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="abandoned-carts-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
