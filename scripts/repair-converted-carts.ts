/*
 * Repairs carts written to after they were converted (bug fixed 13 September 2026).
 *
 * Before the fix the cart cookie kept naming a CONVERTED cart, so a shopper's
 * next basket landed in the row that records their earlier order. Each such
 * row is split back into what it should have been:
 *   - a new CONVERTED row carries the order link (recoveredOrderId, customer,
 *     email, reminder history), with no items;
 *   - the original row, whose token the shopper's cookie still holds, becomes
 *     their ACTIVE basket again with its items and fresh reminder counters.
 *
 *   cd <app> && set -a && . ./.env && set +a
 *   npx tsx --conditions=react-server scripts/repair-converted-carts.ts              # dry run
 *   npx tsx --conditions=react-server scripts/repair-converted-carts.ts --apply --backup /root/rollback/<ts>/converted-carts.json
 *
 * The backup holds every affected cart and its items as they were, and is
 * refused if the file already exists.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "../src/lib/prisma";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const backupAt = args.indexOf("--backup");
const backup = backupAt >= 0 ? args[backupAt + 1] : undefined;

(async () => {
  if (apply && !backup) throw new Error("--apply needs --backup <file>");

  const carts = await prisma.cart.findMany({
    where: { status: "CONVERTED", items: { some: {} } },
    include: { items: true },
    orderBy: { lastActivityAt: "asc" },
  });

  console.log(`${carts.length} converted cart(s) still holding items`);
  for (const c of carts) {
    const qty = c.items.reduce((n, i) => n + i.quantity, 0);
    console.log(
      `  ${c.id}  lines=${c.items.length} qty=${qty} lastActivity=${c.lastActivityAt.toISOString()} order=${c.recoveredOrderId ? "linked" : "none"} account=${c.customerId ? "yes" : "no"}`,
    );
  }

  if (!apply) {
    console.log("Dry run: nothing changed.");
    return;
  }
  if (carts.length === 0) return;

  mkdirSync(dirname(backup!), { recursive: true });
  writeFileSync(backup!, JSON.stringify(carts, null, 2), { flag: "wx" });
  console.log(`Backup written: ${backup}`);

  let repaired = 0;
  for (const c of carts) {
    const done = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: the shopper may have checked out since.
      const cart = await tx.cart.findUnique({ where: { id: c.id }, include: { items: true } });
      if (!cart || cart.status !== "CONVERTED" || cart.items.length === 0) return false;

      const order = cart.recoveredOrderId
        ? await tx.order.findUnique({ where: { id: cart.recoveredOrderId }, select: { createdAt: true } })
        : null;

      await tx.cart.create({
        data: {
          token: randomBytes(24).toString("hex"),
          status: "CONVERTED",
          recoveredOrderId: cart.recoveredOrderId,
          customerId: cart.customerId,
          email: cart.email,
          remindersSent: cart.remindersSent,
          lastReminderAt: cart.lastReminderAt,
          recoveredAt: cart.recoveredAt,
          itemCount: 0,
          subtotalCents: 0,
          createdAt: cart.createdAt,
          lastActivityAt: order?.createdAt ?? cart.createdAt,
        },
      });

      await tx.cart.update({
        where: { id: cart.id },
        data: {
          status: "ACTIVE",
          recoveredOrderId: null,
          remindersSent: 0,
          lastReminderAt: null,
          recoveredAt: null,
          itemCount: cart.items.reduce((n, i) => n + i.quantity, 0),
          subtotalCents: cart.items
            .filter((i) => !i.isGift)
            .reduce((n, i) => n + i.unitPriceCents * i.quantity, 0),
        },
      });
      return true;
    });
    if (done) repaired++;
  }

  const left = await prisma.cart.count({ where: { status: "CONVERTED", items: { some: {} } } });
  console.log(`Repaired ${repaired}; converted carts still holding items: ${left}`);
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
