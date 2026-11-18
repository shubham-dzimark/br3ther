/*
 * The capability rules themselves - pure data and pure functions.
 *
 * Separated from permissions.ts so they can be imported by tests and by any
 * code that must not drag in next/navigation. permissions.ts re-exports every
 * name, so existing imports are unchanged.
 */
/**
 * Coarse capabilities rather than per-page flags: a role either owns an area
 * of the admin or it doesn't. Every protected page asserts one of these, so
 * hiding a nav item is never the only thing standing between a role and a page.
 */
export const CAPABILITIES = [
  "catalog", // products, categories, attributes, inventory
  "orders", // orders, refunds, abandoned carts, transactions
  "customers",
  "reports",
  "finance", // earnings, withdraws, tax
  "promotions",
  "content", // home page, promo popup, pages
  "support",
  "settings", // shop, seo, payments, email, security, maintenance, backups
  /*
   * How the shop looks and reads: store identity, colours, fonts, barcodes and
   * translations. Split out of "settings" so the person who styles the shop
   * does not also get the mailbox password, the security log and the backups,
   * which is everything else that page group holds.
   */
  "appearance",
  "admins", // managing staff accounts
  /*
   * Seeing a customer's email and phone. Separate from "orders" on purpose:
   * fulfilling an order needs the shipping address, not a way to contact the
   * buyer directly, so a role can pack and ship without holding contact details.
   */
  "customer_pii",
  /*
   * Money movement on an order: confirming an e-Transfer, marking refunded,
   * cancelling. Split out of "orders" because the fulfilment desk is described
   * as "view orders, print packing slips and add tracking" - and every one of
   * these reverses stock, points or a referral reward.
   */
  "order_payments",
  /*
   * Deleting orders, individually or in bulk. Destructive and unrecoverable,
   * so it is not something a fulfilment login should carry.
   */
  "order_delete",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Master",
  STORE_MANAGER: "Store Manager",
  ACCOUNTANT: "Accountant",
  EDITOR: "Editor",
  CUSTOMER_SERVICE: "Customer Service",
  STAFF: "Store Manager",
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  OWNER: "Full access, including staff accounts and every setting.",
  STORE_MANAGER:
    "Fulfilment only: view orders, print packing slips, add tracking and move an order through processing, shipped and delivered. Cannot confirm payments, refund, cancel or delete orders, and cannot see customer contact details.",
  ACCOUNTANT:
    "Money only: orders and transactions, confirming payments, refunds and cancellations, reports, earnings, withdrawals and tax.",
  EDITOR:
    "Content and look: products, categories, pages, plus store identity, colours, fonts and translations. No orders, no money, no mailbox or security settings.",
  CUSTOMER_SERVICE:
    "Customer accounts and support: look up a customer, send them a password reset, and answer the inbox and tickets. No orders, no catalogue, no money, no settings.",
};

const ROLE_CAPABILITIES: Record<string, readonly Capability[]> = {
  OWNER: CAPABILITIES,
  // Fulfilment desk: orders, packing slips and tracking. Deliberately without
  // "customer_pii", so emails and phone numbers are redacted for this role.
  STORE_MANAGER: ["orders"],
  // Legacy value from before named roles existed - same restricted access.
  STAFF: ["orders"],
  ACCOUNTANT: [
    "orders",
    "order_payments",
    "reports",
    "finance",
    "customers",
    "customer_pii",
  ],
  EDITOR: ["catalog", "content", "promotions", "appearance"],
  /*
   * The support desk. Customer accounts and the inbox, and nothing else -
   * no catalogue, no orders, no money, no settings. "customer_pii" is
   * deliberate rather than incidental: answering "I can't sign in" means
   * seeing the address the reset has to go to.
   */
  CUSTOMER_SERVICE: ["customers", "customer_pii", "support"],
};

export function capabilitiesFor(role: string): readonly Capability[] {
  return ROLE_CAPABILITIES[role] ?? [];
}

export function can(role: string, capability: Capability): boolean {
  return capabilitiesFor(role).includes(capability);
}

/**
 * Where to send someone who has landed somewhere they cannot go.
 *
 * Must be a page the role can actually open, or the redirect bounces. That is
 * exactly what used to happen to an Editor: the dashboard needs "reports",
 * which they lack, so it sent them to /admin/orders - which needs "orders",
 * which they also lack, so it sent them back to /admin. The browser gave up
 * with ERR_TOO_MANY_REDIRECTS and the panel was unusable for that role.
 *
 * Ordered by how much of the job each area represents, so a role lands on the
 * screen it is actually meant to work in.
 */
const LANDING: [Capability, string][] = [
  ["reports", "/admin"],
  ["orders", "/admin/orders"],
  ["catalog", "/admin/products"],
  ["content", "/admin/content/home"],
  ["promotions", "/admin/promotions/coupons"],
  ["customers", "/admin/customers"],
  ["finance", "/admin/finance/earnings"],
  ["support", "/admin/support/inbox"],
  ["appearance", "/admin/settings"],
  ["settings", "/admin/settings/store"],
  ["admins", "/admin/staff"],
];

export function landingFor(role: string): string {
  const caps = capabilitiesFor(role);
  const hit = LANDING.find(([cap]) => caps.includes(cap));
  /*
   * A role with no capabilities at all gets the dead-end page rather than any
   * real screen. It gates on nothing but being signed in, so it cannot bounce.
   */
  return hit ? hit[1] : "/admin/no-access";
}

/**
 * Server-side gate for a protected admin page. Returns the signed-in user so
 * callers can use it directly.
 */
