"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getCarriers } from "@/lib/carriers";
import {
  parseCsvLine,
  parseShippedDate,
  resolveCarrier,
  splitCsvLines,
} from "@/lib/tracking-csv";
import { queueOrderMail, sendShippedEmail } from "@/lib/order-mail";

const MAX_ROWS = 5000;

/**
 * Bulk-attach tracking numbers from a CSV.
 *
 * Matching is by order number, which is the only stable human-facing handle -
 * internal ids never appear on a courier's sheet. Rows are applied one by one
 * rather than in a transaction: a partial import of 400 good rows is more
 * useful than rejecting the file over one typo, and the summary says exactly
 * which rows were skipped.
 */
export async function importTracking(fd: FormData): Promise<void> {
  const admin = await requireCapability("orders");

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/orders/shipping?error=nofile");
  }
  const dateOrder = fd.get("dateOrder") === "mdy" ? "mdy" : "dmy";
  const replaceExisting = fd.get("replaceExisting") === "on";
  // Fallback for rows with no date of their own. Stamping "now" silently was
  // wrong for a file uploaded days after the parcels actually went out.
  const fallbackRaw = String(fd.get("defaultShippedAt") ?? "").trim();
  const fallbackShipped = /^\d{4}-\d{2}-\d{2}$/.test(fallbackRaw)
    ? new Date(`${fallbackRaw}T00:00:00.000Z`)
    : new Date();

  const carriers = await getCarriers(false);
  const lines = splitCsvLines(await file.text());
  if (lines.length < 2) redirect("/admin/orders/shipping?error=empty");

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const iOrder = col("ordernumber", "order", "orderid", "ordernumbers");
  const iCarrier = col("carrier", "shippingcarrier", "provider");
  const iCode = col("trackingnumber", "tracking", "trackingcode", "trackingno");
  const iDate = col("shippeddate", "date", "shipped", "datashipped");

  if (iOrder === -1 || iCode === -1) {
    redirect("/admin/orders/shipping?error=columns");
  }

  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  let alreadyTracked = 0;

  for (const line of lines.slice(1, MAX_ROWS + 1)) {
    const cells = parseCsvLine(line);
    const orderNumber = (cells[iOrder] ?? "").trim();
    const code = (cells[iCode] ?? "").trim();
    if (!orderNumber || !code) {
      skipped += 1;
      continue;
    }

    /*
     * A courier's sheet may write the number as "#0001" or "0001", and a file
     * from before the format change may still say "NL-2026-0001". Try it as
     * given, then without a leading "#", so all three match.
     */
    const candidates = Array.from(
      new Set([orderNumber, orderNumber.replace(/^#/, "").trim()]),
    ).filter(Boolean);

    const order = await prisma.order.findFirst({
      where: { orderNumber: { in: candidates } },
      select: { id: true, trackingCode: true },
    });
    if (!order) {
      notFound += 1;
      continue;
    }
    if (order.trackingCode && !replaceExisting) {
      alreadyTracked += 1;
      continue;
    }

    const carrier = iCarrier === -1 ? null : resolveCarrier(carriers, cells[iCarrier] ?? "");
    const shipped =
      iDate === -1 ? null : parseShippedDate(cells[iDate] ?? "", dateOrder);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        trackingCode: code,
        // Unknown carrier names fall back to "other" rather than losing the
        // number entirely - the tracking link degrades, the data does not.
        trackingCarrier: carrier ?? "other",
        shippedAt: shipped ?? fallbackShipped,
        trackingAddedBy: admin.name,
        trackingSource: "csv",
      },
    });
    // One shipping notice per row actually written, so re-importing a file
    // with "replace existing" off doesn't email the same buyers again.
    queueOrderMail(sendShippedEmail, order.id);
    updated += 1;
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin/orders/shipping");
  redirect(
    `/admin/orders/shipping?imported=${updated}&skipped=${skipped}` +
      `&missing=${notFound}&existing=${alreadyTracked}`,
  );
}
