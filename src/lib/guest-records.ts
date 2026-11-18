import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Delete guest checkout records (customers with no password).
 *
 * Registered accounts are never touched here, even if their id is passed in.
 * Orders, carts, tickets and reviews survive with the customer link cleared,
 * so revenue history and invoices stay intact; the guest's saved addresses and
 * any pending claim link go with the record. If the person registers later
 * they get a fresh account, without the old orders attached.
 */
export async function deleteGuestRecords(ids: string[]): Promise<number> {
  const clean = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (clean.length === 0) return 0;
  const result = await prisma.customer.deleteMany({
    where: { id: { in: clean }, passwordHash: null },
  });
  return result.count;
}
