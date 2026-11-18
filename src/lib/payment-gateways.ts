import "server-only";
import { prisma } from "@/lib/prisma";
import { emtAvailableFor, getEmtConfig } from "@/lib/emt";
import { CRYPTO_KEY, getCryptoConfig } from "@/lib/crypto-pay";

/**
 * Every payment gateway the shop has, and which of them checkout may offer.
 *
 * On/off and order live in the PaymentMethod table, one row per gateway; each
 * gateway keeps its own settings elsewhere (e-Transfer under emt.*, crypto
 * under crypto.*). A gateway with no row yet falls back to its default here,
 * so e-Transfer stays on for a shop that has never opened this screen.
 */

export type GatewayKey = "emt" | "crypto";

export const GATEWAY_KEYS: readonly GatewayKey[] = ["emt", CRYPTO_KEY];

export function isGatewayKey(value: unknown): value is GatewayKey {
  return value === "emt" || value === CRYPTO_KEY;
}

const DEFAULTS: Record<GatewayKey, { label: string; adminHref: string; enabled: boolean; sortOrder: number }> = {
  emt: {
    label: "Interac e-Transfer",
    adminHref: "/admin/settings/payments/emt",
    enabled: true,
    sortOrder: 0,
  },
  crypto: {
    label: "Crypto Payment",
    adminHref: "/admin/settings/payments/crypto",
    // On by default like the plugin's Enable/Disable, but checkout still hides
    // it until the connection has been validated.
    enabled: true,
    sortOrder: 1,
  },
};

export type GatewayRow = {
  key: GatewayKey;
  /** What the gateway is, for the admin. */
  label: string;
  /** What the customer sees at checkout. */
  title: string;
  description: string;
  enabled: boolean;
  sortOrder: number;
  adminHref: string;
  /** Whether it can actually take a payment as configured. */
  ready: boolean;
  note: string | null;
};

const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function listGateways(): Promise<GatewayRow[]> {
  const [stored, emt, crypto] = await Promise.all([
    prisma.paymentMethod.findMany({ where: { key: { in: [...GATEWAY_KEYS] } } }),
    getEmtConfig(),
    getCryptoConfig(),
  ]);
  const row = new Map(stored.map((r) => [r.key, r]));

  const list: GatewayRow[] = [
    {
      key: "emt",
      label: DEFAULTS.emt.label,
      title: emt.title,
      description: emt.description,
      enabled: row.get("emt")?.isEnabled ?? DEFAULTS.emt.enabled,
      sortOrder: row.get("emt")?.sortOrder ?? DEFAULTS.emt.sortOrder,
      adminHref: DEFAULTS.emt.adminHref,
      ready: Boolean(emt.recipientEmail),
      note: emt.recipientEmail ? null : "No recipient email set yet.",
    },
    {
      key: "crypto",
      label: DEFAULTS.crypto.label,
      title: crypto.title,
      // The plugin strips tags for the checkout line; the payment page keeps HTML.
      description: plain(crypto.description),
      enabled: row.get(CRYPTO_KEY)?.isEnabled ?? DEFAULTS.crypto.enabled,
      sortOrder: row.get(CRYPTO_KEY)?.sortOrder ?? DEFAULTS.crypto.sortOrder,
      adminHref: DEFAULTS.crypto.adminHref,
      ready: crypto.active,
      note: !crypto.active
        ? "Not connected - save and validate the crypto settings to activate."
        : crypto.mode === "test"
          ? "Test mode - only signed-in admins see it at checkout."
          : null,
    },
  ];

  return list.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
}

export type CheckoutGateway = {
  key: GatewayKey;
  title: string;
  description: string;
  available: boolean;
  reason: string | null;
};

/**
 * The gateways checkout shows, in order. Switched-off gateways are left out.
 *
 * Crypto follows the plugin's is_available(): only once the connection has
 * been validated, and in test mode only for administrators. e-Transfer keeps
 * its order-total limits, shown as unavailable rather than hidden so the
 * customer learns why.
 */
export async function checkoutGateways(options: {
  subtotalCents: number;
  isAdmin: boolean;
}): Promise<CheckoutGateway[]> {
  const [list, emt, crypto] = await Promise.all([listGateways(), getEmtConfig(), getCryptoConfig()]);
  const out: CheckoutGateway[] = [];

  for (const gateway of list) {
    if (!gateway.enabled) continue;

    if (gateway.key === "emt") {
      const within = emtAvailableFor(options.subtotalCents, emt);
      out.push({
        key: "emt",
        title: gateway.title,
        description: gateway.description,
        available: within,
        reason: within ? null : "Not available for this order total.",
      });
      continue;
    }

    if (!crypto.active) continue;
    if (crypto.mode === "test" && !options.isAdmin) continue;
    out.push({
      key: "crypto",
      title: gateway.title,
      description: gateway.description,
      available: true,
      reason: null,
    });
  }

  return out;
}
