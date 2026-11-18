import { prisma } from "@/lib/prisma";
import { requireCapability, can } from "@/lib/permissions";
import { csvRow } from "@/lib/tracking-csv";
import { getTimeZone, ymd } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/**
 * Customer list as CSV - name and email, for a mailing list or a backup.
 * `?view=guests` exports guest checkouts instead, with their order count and
 * last order date, matching the Guests tab.
 *
 * Gated on customer_pii rather than just "customers": the whole point of the
 * file is contact details, so a role that has its emails redacted on screen
 * must not be able to download them instead.
 */
export async function GET(request: Request): Promise<Response> {
  const me = await requireCapability("customers");
  const tz = await getTimeZone();
  if (!can(me.role, "customer_pii")) {
    return new Response("Not allowed to export customer contact details.", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const guests = url.searchParams.get("view") === "guests";

  // Mirrors the search on the customers page, so "export" means "export what
  // I am looking at" rather than silently ignoring the filter.
  const customers = await prisma.customer.findMany({
    // The tab being exported: registered accounts, or guest checkouts.
    where: {
      AND: [
        guests ? { passwordHash: null } : { passwordHash: { not: null } },
        q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      email: true,
      _count: { select: { orders: true } },
      orders: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const body = (
    guests
      ? [
          "name,email,orders,last_order",
          ...customers.map((c) =>
            csvRow([c.name ?? "", c.email, String(c._count.orders), c.orders[0] ? ymd(c.orders[0].createdAt, tz) : ""]),
          ),
        ]
      : ["name,email", ...customers.map((c) => csvRow([c.name ?? "", c.email]))]
  ).join("\n");

  const stamp = ymd(new Date(), tz);
  return new Response(`﻿${body}`, {
    headers: {
      // The BOM makes Excel read it as UTF-8; without it accented names break.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${guests ? "guests" : "customers"}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
