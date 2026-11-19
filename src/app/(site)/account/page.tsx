import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/customer-auth";
import { orderNo } from "@/lib/order-display";
import { Shell, PageHead } from "@/components/site/Shell";
import { logoutCustomer } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

const STATUS: Record<string, string> = {
  AWAITING_PAYMENT: "Waiting for payment",
  ON_HOLD: "On hold",
  PAYMENT_RECEIVED: "Paid",
  PROCESSING: "Being packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  FAILED: "Payment failed",
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(cents / 100);

/** A signed-in customer's orders, newest first, each opening its receipt. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const customer = await requireCustomer();
  const { welcome } = await searchParams;
  const orders = await prisma.order.findMany({
    where: { OR: [{ customerId: customer.id }, { email: customer.email }] },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { items: { select: { nameSnapshot: true, variantSnapshot: true, quantity: true } } },
  });
  const first = (customer.name ?? "").split(/\s+/)[0];

  return (
    <Shell>
      <PageHead
        kicker="Your account"
        title={first ? `Hello, ${first}` : "Your account"}
        lede={customer.email}
        aside={
          <form action={logoutCustomer}>
            <button className="btn btn--ghost" type="submit">Sign out</button>
          </form>
        }
      />

      {welcome ? <p className="ok-note" role="status" style={{ marginBottom: 24 }}>Your account is ready.</p> : null}

      <section aria-labelledby="orders-title">
        <h2 id="orders-title" className="poster section-title">Orders</h2>
        {orders.length === 0 ? (
          <div className="panel">
            <p className="lead">No orders yet.</p>
            <p style={{ marginTop: 20 }}><Link className="btn" href="/#buy">Buy No.3</Link></p>
          </div>
        ) : (
          <ul style={{ display: "grid", gap: 8 }}>
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/checkout/received/${encodeURIComponent(o.orderNumber)}`}
                  className="panel"
                  style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 16, textDecoration: "none" }}
                >
                  <span>
                    <b style={{ fontSize: "1.125rem" }}>{orderNo(o.orderNumber)}</b>
                    <span className="muted" style={{ display: "block" }}>
                      {o.createdAt.toLocaleDateString("en-CA", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                      {o.items.map((i) => `${i.quantity} × ${i.variantSnapshot ?? i.nameSnapshot}`).join(", ")}
                    </span>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <b>{money(o.totalCents, o.currency)}</b>
                    <span className="muted" style={{ display: "block" }}>{STATUS[o.status] ?? o.status}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}
