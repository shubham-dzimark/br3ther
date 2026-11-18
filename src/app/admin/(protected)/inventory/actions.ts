"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

import { requireCapability } from "@/lib/permissions";
import { applyBulkStock } from "@/lib/inventory-bulk";
// Hand edits go to Sortly straight away, as saving a product does.
import { kickSortlySync } from "@/lib/sortly/outbox";
import type { StockStatus } from "@/generated/prisma";

const STATUSES = ["IN_STOCK", "OUT_OF_STOCK", "ON_BACKORDER"];
const MODES = ["set", "add", "remove"] as const;

/**
 * Back to Manage inventory with its search and filter, never anywhere else:
 * `back` comes from the form, so an outside address or another path is
 * replaced with the plain page.
 */
function backTo(fd: FormData, extra: Record<string, string> = {}): string {
  const base = "http://admin.local";
  let url: URL;
  try {
    url = new URL(String(fd.get("back") ?? ""), base);
  } catch {
    url = new URL("/admin/inventory", base);
  }
  if (url.origin !== base || url.pathname !== "/admin/inventory") url = new URL("/admin/inventory", base);
  url.searchParams.delete("saved");
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

/**
 * Bulk inventory update.
 *
 * The form posts one "Track quantity" checkbox for every listed option
 * (`trackAll`, absent means off), then per visible row stockStatus_<id> and
 * stock_<id>. The quantity box is always posted, hidden while tracking is off.
 *
 * Backorders are not on this screen and are never written here - each option
 * keeps the rule set on its product. A count is kept when tracking goes off,
 * so switching it back on does not start every option again at zero.
 */
export async function updateStock(fd: FormData): Promise<void> {
  await requireCapability("catalog");

  const ids = new Set<string>();
  for (const key of fd.keys()) {
    const match = key.match(/^(?:stock|stockStatus)_(.+)$/);
    if (match) ids.add(match[1]);
  }

  const read = (field: string, id: string) => fd.get(`${field}_${id}`);
  const manageStock = fd.get("trackAll") === "on";

  await prisma.$transaction(
    [...ids].map((id) => {
      const rawStock = read("stock", id);
      const stock = rawStock === null ? null : Number(rawStock);
      const status = String(read("stockStatus", id) ?? "");

      return prisma.productVariant.update({
        where: { id },
        data: {
          manageStock,
          ...(stock !== null && Number.isFinite(stock) && stock >= 0
            ? { stock: Math.floor(stock) }
            : {}),
          ...(STATUSES.includes(status) ? { stockStatus: status as StockStatus } : {}),
        },
      });
    }),
  );
  kickSortlySync([...ids]);

  revalidatePath("/admin/inventory");
  revalidatePath("/shop");
  redirect("/admin/inventory?saved=1");
}

/**
 * The bar above the table: one change - tracking, a quantity to set, add or
 * remove, and/or a status - applied to every ticked option. Nothing ticked or
 * nothing chosen changes nothing and simply returns to the page.
 */
export async function bulkUpdateStock(fd: FormData): Promise<void> {
  await requireCapability("catalog");

  const ids = [...new Set(fd.getAll("ids").map(String).filter(Boolean))];
  const track = String(fd.get("bulkTrack") ?? "");
  const status = String(fd.get("bulkStatus") ?? "");
  const mode = String(fd.get("bulkMode") ?? "set");
  const raw = String(fd.get("bulkAmount") ?? "").trim();
  const amount = raw === "" ? null : Number(raw);

  const changed =
    ids.length === 0
      ? 0
      : await applyBulkStock(ids, {
          track: track === "on" || track === "off" ? track : null,
          status: STATUSES.includes(status) ? (status as StockStatus) : null,
          mode: MODES.find((m) => m === mode) ?? "set",
          amount: amount !== null && Number.isFinite(amount) && amount >= 0 ? amount : null,
        });

  if (changed > 0) {
    kickSortlySync(ids);
    revalidatePath("/admin/inventory");
    revalidatePath("/shop");
    revalidatePath("/", "layout");
    redirect(backTo(fd, { saved: "1" }));
  }
  redirect(backTo(fd));
}
